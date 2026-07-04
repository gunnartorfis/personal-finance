"use client"

import { CircleAlert, CircleCheck, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { type FormEvent, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TYPES, type RealType } from "@/shared/types"

/** The i18n label key for each real expense type, in display order. */
const ROWS: ReadonlyArray<{ type: RealType; labelKey: "fixed" | "necessary" | "niceToHave" }> = [
  { type: "Fixed", labelKey: "fixed" },
  { type: "Necessary", labelKey: "necessary" },
  { type: "Nice to have", labelKey: "niceToHave" },
]

type Amounts = Record<RealType, string>
const EMPTY: Amounts = { Fixed: "", Necessary: "", "Nice to have": "" }

interface BudgetRow {
  expenseType: RealType
  monthlyAmount: number
}

/**
 * The category-budgets form (#103): one monthly-amount input per real expense type. Loads the
 * household's budgets on mount and saves the whole set with a single PUT (an empty field clears that
 * category's budget). Mirrors the savings config form's fetch/save/status shape.
 */
export function BudgetConfigForm() {
  const t = useTranslations("budgets")
  const [amounts, setAmounts] = useState<Amounts>(EMPTY)
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void fetch("/api/budgets")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load failed"))))
      .then((data: { budgets: BudgetRow[] }) => {
        if (!active) return
        const next = { ...EMPTY }
        for (const b of data.budgets) next[b.expenseType] = String(b.monthlyAmount)
        setAmounts(next)
      })
      .catch(() => {
        /* leave the form empty on load failure; the user can still set budgets */
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // Block interaction until the initial load resolves, so a slow fetch can't clobber typed input.
  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {t("loading")}
      </p>
    )
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setStatus("saving")
    const budgets = TYPES.flatMap((type) => {
      const raw = amounts[type].trim()
      if (raw === "") return []
      const monthlyAmount = Number(raw)
      return [{ expenseType: type, monthlyAmount }]
    })
    try {
      const res = await fetch("/api/budgets", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ budgets }),
      })
      setStatus(res.ok ? "saved" : "error")
    } catch {
      setStatus("error")
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4">
      {ROWS.map((row) => (
        <label key={row.type} className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">{t(row.labelKey)}</span>
          <Input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            className="w-40"
            placeholder={t("amountPlaceholder")}
            value={amounts[row.type]}
            onChange={(e) => {
              setStatus("idle")
              setAmounts((prev) => ({ ...prev, [row.type]: e.target.value }))
            }}
          />
        </label>
      ))}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>
          {status === "saving" ? (
            <>
              <Loader2 className="size-4 animate-spin" /> {t("saving")}
            </>
          ) : (
            t("save")
          )}
        </Button>
        {status === "saved" && (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <CircleCheck className="size-4" /> {t("saved")}
          </span>
        )}
        {status === "error" && (
          <span className="flex items-center gap-1 text-sm text-destructive">
            <CircleAlert className="size-4" /> {t("error")}
          </span>
        )}
      </div>
    </form>
  )
}
