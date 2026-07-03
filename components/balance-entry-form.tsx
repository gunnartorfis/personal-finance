"use client"

import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { type FormEvent, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AccountBalance } from "@/lib/dashboard/net-worth"
import { cn } from "@/lib/utils"

/**
 * Inline manual balance entry for the Financial health section (ADR-0016): a disclosure button that
 * reveals one number field per Account, prefilled with its latest recorded balance. Submitting POSTs
 * the non-blank values to `/api/account-balances` (append-only snapshots) and refreshes so the
 * server-rendered net-worth / runway tiles pick up the new figures. Balances may be negative (card
 * debt). Rendered only when the Household has at least one Account.
 */
export function BalanceEntryForm({
  accounts,
  className,
}: {
  accounts: AccountBalance[]
  className?: string
}) {
  const t = useTranslations("dashboard.financialHealth")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [errored, setErrored] = useState(false)

  const hasAnyBalance = accounts.some((account) => account.balance !== null)

  // Toggle open/closed, always clearing a prior error so a stale banner never greets the next open.
  function setFormOpen(next: boolean) {
    setErrored(false)
    setOpen(next)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const balances: Array<{ accountId: string; balance: number }> = []
    for (const account of accounts) {
      const raw = String(formData.get(`balance-${account.id}`) ?? "").trim()
      if (raw === "") continue // a blank field leaves that Account's balance unchanged
      const balance = Number(raw)
      if (Number.isFinite(balance)) balances.push({ accountId: account.id, balance })
    }
    if (balances.length === 0) {
      setOpen(false)
      return
    }
    startTransition(async () => {
      setErrored(false)
      try {
        const res = await fetch("/api/account-balances", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ balances }),
        })
        if (!res.ok) {
          setErrored(true)
          return
        }
        setOpen(false)
        router.refresh()
      } catch {
        // Network-level failure: keep the form open and surface a retry, rather than letting an
        // async-transition throw escape to the nearest Error Boundary and take down the section.
        setErrored(true)
      }
    })
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("self-start", className)}
        onClick={() => setFormOpen(true)}
      >
        {hasAnyBalance ? t("updateBalances") : t("addBalances")}
      </Button>
    )
  }

  return (
    <form onSubmit={submit} className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-3">
        {accounts.map((account) => (
          <div key={account.id} className="flex flex-col gap-1">
            <label htmlFor={`balance-${account.id}`} className="text-sm text-muted-foreground">
              {account.name}
            </label>
            <Input
              id={`balance-${account.id}`}
              name={`balance-${account.id}`}
              type="number"
              inputMode="numeric"
              step="1"
              defaultValue={account.balance ?? ""}
              className="max-w-xs tabular-nums"
            />
          </div>
        ))}
      </div>
      {errored && (
        <p role="alert" className="text-sm text-destructive">
          {t("balanceError")}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {t("saveBalances")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setFormOpen(false)}
          disabled={pending}
        >
          {t("cancelBalances")}
        </Button>
      </div>
    </form>
  )
}
