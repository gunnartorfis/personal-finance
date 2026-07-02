"use client"

import { Landmark, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import type { Institution } from "@/lib/open-banking/provider"
import { cn } from "@/lib/utils"

/** All supported banks are Icelandic; the connect body carries this (the row stores no country). */
const COUNTRY = "IS"

/**
 * First-connect entry (#119): pick a bank and start consent. Loads the connectable institutions, and
 * on connect POSTs the choice to the connect route and sends the user to the bank's SCA redirect.
 * Rendered only for Premium households (wrapped in {@link BankSyncGate} by the accounts page), so it
 * assumes access — the route enforces the gate regardless.
 */
export function ConnectBank({ className }: { className?: string }) {
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selected, setSelected] = useState("")
  const [busy, setBusy] = useState(false)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    let ignore = false
    async function load() {
      try {
        const res = await fetch("/api/open-banking/institutions")
        if (!res.ok) throw new Error("could not load institutions")
        const data = (await res.json()) as Institution[]
        if (!ignore) {
          setInstitutions(data)
          setSelected((current) => current || (data[0]?.name ?? ""))
        }
      } catch {
        if (!ignore) setLoadError(true)
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    void load()
    return () => {
      ignore = true
    }
  }, [])

  async function connect() {
    if (!selected) return
    setBusy(true)
    setErrored(false)
    try {
      const res = await fetch("/api/open-banking/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ institutionName: selected, country: COUNTRY }),
      })
      if (!res.ok) throw new Error("connect failed")
      const { url } = (await res.json()) as { url: string }
      window.location.assign(url) // navigates away; busy stays true until unload
    } catch {
      setErrored(true)
      setBusy(false)
    }
  }

  return (
    <section
      aria-label="Connect a bank"
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-card p-6 sm:flex-row sm:items-end",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <label htmlFor="connect-bank" className="text-sm font-medium">
          Connect a bank
        </label>
        <p id="connect-bank-hint" className="text-sm text-pretty text-muted-foreground">
          Link your bank to sync transactions automatically — no more CSV uploads.
        </p>
        {loadError ? (
          <p role="alert" className="text-sm text-destructive">
            Couldn&apos;t load banks — please refresh.
          </p>
        ) : (
          <select
            id="connect-bank"
            aria-describedby="connect-bank-hint"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            disabled={loading || busy || institutions.length === 0}
            className="mt-1 h-9 rounded-md border border-border bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50"
          >
            {loading ? (
              <option>Loading…</option>
            ) : (
              institutions.map((institution) => (
                <option key={institution.name} value={institution.name}>
                  {institution.name}
                </option>
              ))
            )}
          </select>
        )}
        {errored && (
          <p role="alert" className="text-sm text-destructive">
            Couldn&apos;t start the connection — try again.
          </p>
        )}
      </div>
      <Button type="button" onClick={() => void connect()} disabled={busy || loading || !selected}>
        {busy ? <Loader2 className="animate-spin" /> : <Landmark />}
        {busy ? "Connecting…" : "Connect"}
      </Button>
    </section>
  )
}
