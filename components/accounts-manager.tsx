"use client"

import { CircleAlert, Loader2, Plus } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface Account {
  id: string
  name: string
}

/**
 * Manage the current Household's accounts (Phase H): list them and add new ones. Accounts are the
 * provenance an upload's transactions attach to, so this is the prerequisite for the upload flow.
 */
export function AccountsManager({ className }: { className?: string }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [errored, setErrored] = useState(false)

  // Pure fetch (no setState) so the effect and handlers reuse it without a setState-in-effect.
  async function fetchAccounts(): Promise<Account[]> {
    const res = await fetch("/api/accounts")
    if (!res.ok) throw new Error("could not load accounts")
    return (await res.json()) as Account[]
  }

  // Re-list after a mutation. Lets failures propagate so the caller can surface them — its only
  // caller, addAccount, has a catch that shows the error rather than silently dropping the refetch.
  async function refresh() {
    setAccounts(await fetchAccounts())
    setLoadError(false)
  }

  useEffect(() => {
    let ignore = false
    async function loadInitial() {
      try {
        const data = await fetchAccounts()
        if (!ignore) setAccounts(data)
      } catch {
        if (!ignore) setLoadError(true)
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    void loadInitial()
    return () => {
      ignore = true
    }
  }, [])

  async function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setErrored(false)
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        setErrored(true)
        return
      }
      setName("")
      await refresh()
    } catch {
      setErrored(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Accounts" className={cn("flex flex-col gap-6", className)}>
      <form
        onSubmit={addAccount}
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="account-name" className="text-sm font-medium">
            Name
          </label>
          <Input
            id="account-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            placeholder="e.g. Visa, Landsbankinn"
          />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Plus />}
          Add account
        </Button>
      </form>

      {errored && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>Couldn’t add the account.</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : loadError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>Couldn’t load accounts. Please refresh.</p>
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No accounts yet.
        </div>
      ) : (
        <ul
          role="list"
          className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card"
        >
          {accounts.map((account) => (
            <li key={account.id} className="px-4 py-3 text-sm font-medium">
              {account.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
