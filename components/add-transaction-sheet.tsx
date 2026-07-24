"use client"

import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { type FormEvent, useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { createTransaction } from "@/lib/transactions/create-client"
import { EXPENSE_TYPES, type ExpenseType } from "@/shared/types"

/** A Household Account the manual row can belong to. */
export interface AccountOption {
  id: string
  name: string
  isDefault: boolean
}

/** The real (non-"") expense buckets a manual debit can be typed with. */
const REAL_EXPENSE_TYPES = EXPENSE_TYPES.filter(
  (t): t is Exclude<ExpenseType, ""> => t !== ""
)

const selectClass =
  "h-9 w-full rounded-md border border-input bg-input/20 px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"

/** Today as `YYYY-MM-DD` for the date field's default. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** The editable form fields, held as one object so the controls aren't a pile of related useStates. */
interface FormState {
  accountId: string
  kind: "expense" | "income"
  amount: string
  merchant: string
  date: string
  expenseType: "" | Exclude<ExpenseType, "">
}

/**
 * "Add transaction" — hand-enter a Transaction (ADR-0026). A header button opens a Sheet with a small
 * form (account, expense/income, amount, merchant, date, optional expense type). Amount is entered as
 * a positive magnitude; the expense/income choice sets the sign. On success the sheet closes and the
 * page refreshes so the new row and the server-derived summaries appear. Types are debit-only; picking
 * one stores an Override server-side so the row skips the AI queue.
 */
export function AddTransactionSheet({ accounts }: { accounts: AccountOption[] }) {
  const t = useTranslations("addTransaction")
  const router = useRouter()
  const ids = useId()
  const defaultAccount = accounts.find((a) => a.isDefault) ?? accounts[0]

  const initialForm = (): FormState => ({
    accountId: defaultAccount?.id ?? "",
    kind: "expense",
    amount: "",
    merchant: "",
    date: todayIso(),
    expenseType: "",
  })

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(initialForm)
  const [busy, setBusy] = useState(false)
  const [errored, setErrored] = useState(false)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const magnitude = Math.round(Number(form.amount))
    const merchant = form.merchant.trim()
    if (
      !Number.isFinite(magnitude) ||
      magnitude <= 0 ||
      merchant === "" ||
      form.accountId === ""
    ) {
      setErrored(true)
      return
    }
    setBusy(true)
    setErrored(false)
    try {
      await createTransaction({
        accountId: form.accountId,
        date: form.date,
        amount: form.kind === "expense" ? -magnitude : magnitude,
        merchant,
        ...(form.kind === "expense" && form.expenseType !== ""
          ? { expenseType: form.expenseType }
          : {}),
      })
    } catch {
      setErrored(true)
      setBusy(false)
      return
    }
    setBusy(false)
    setForm(initialForm())
    setOpen(false)
    router.refresh()
  }

  const field = (key: string) => `${ids}-${key}`

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" disabled={accounts.length === 0} />
        }
      >
        <Plus />
        {t("trigger")}
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col gap-0">
        <SheetHeader className="border-b">
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4 p-4">
          {accounts.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={field("account")} className="text-sm font-medium">
                {t("account")}
              </label>
              <select
                id={field("account")}
                className={selectClass}
                value={form.accountId}
                onChange={(e) => set("accountId", e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor={field("kind")} className="text-sm font-medium">
              {t("kind")}
            </label>
            <select
              id={field("kind")}
              className={selectClass}
              value={form.kind}
              onChange={(e) => set("kind", e.target.value as FormState["kind"])}
            >
              <option value="expense">{t("expense")}</option>
              <option value="income">{t("income")}</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={field("amount")} className="text-sm font-medium">
              {t("amount")}
            </label>
            <Input
              id={field("amount")}
              type="number"
              min={1}
              step={1}
              required
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={field("merchant")} className="text-sm font-medium">
              {t("merchant")}
            </label>
            <Input
              id={field("merchant")}
              required
              value={form.merchant}
              onChange={(e) => set("merchant", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={field("date")} className="text-sm font-medium">
              {t("date")}
            </label>
            <Input
              id={field("date")}
              type="date"
              required
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </div>

          {form.kind === "expense" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={field("type")} className="text-sm font-medium">
                {t("expenseType")}
              </label>
              <select
                id={field("type")}
                className={selectClass}
                value={form.expenseType}
                onChange={(e) =>
                  set("expenseType", e.target.value as FormState["expenseType"])
                }
              >
                <option value="">{t("expenseTypeNone")}</option>
                {REAL_EXPENSE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          )}

          {errored && (
            <p role="alert" className="text-sm text-destructive">
              {t("saveError")}
            </p>
          )}

          <SheetFooter className="px-0">
            <Button type="submit" disabled={busy}>
              {t("save")}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
