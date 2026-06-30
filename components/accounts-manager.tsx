"use client"

import { type FormEvent, useEffect, useState } from "react"

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

  async function refresh() {
    try {
      setAccounts(await fetchAccounts())
      setLoadError(false)
    } catch {
      // keep the current list on a transient failure
    }
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
    <section className={cn("flex flex-col gap-4", className)}>
      <h2 className="text-lg font-medium">Accounts</h2>

      <form onSubmit={addAccount} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="account-name" className="text-sm text-muted-foreground">
            Name
          </label>
          <input
            id="account-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className="rounded-md border border-border bg-transparent px-2 py-1 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md border border-border px-3 py-1 text-sm font-medium"
        >
          Add account
        </button>
      </form>

      {errored && (
        <p role="alert" className="text-sm text-destructive">
          Couldn’t add the account.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : loadError ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn’t load accounts. Please refresh.
        </p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No accounts yet.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {accounts.map((account) => (
            <li key={account.id} className="font-medium">
              {account.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
