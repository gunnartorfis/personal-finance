"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"

/**
 * Disconnect a bank connection (#118). Disconnecting stops sync and can't be silently undone, so it
 * asks for inline confirmation first (no dialog dependency). On confirm it POSTs to the disconnect
 * route and refreshes the server-rendered list; on failure it surfaces an inline message.
 */
export function DisconnectButton({
  connectionId,
  institutionName,
}: {
  connectionId: string
  institutionName: string
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errored, setErrored] = useState(false)

  async function disconnect() {
    setBusy(true)
    setErrored(false)
    try {
      const res = await fetch(`/api/open-banking/connections/${connectionId}/disconnect`, {
        method: "POST",
      })
      if (!res.ok) throw new Error("disconnect failed")
      setConfirming(false)
      router.refresh()
    } catch {
      setErrored(true)
    } finally {
      setBusy(false)
    }
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="destructive"
        size="lg"
        onClick={() => setConfirming(true)}
        aria-label={`Disconnect ${institutionName}`}
      >
        Disconnect
      </Button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={() => {
            setConfirming(false)
            setErrored(false) // don't carry a prior failure into the next attempt
          }}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="lg"
          onClick={() => void disconnect()}
          disabled={busy}
          aria-label={`Confirm disconnect ${institutionName}`}
        >
          {busy ? <Loader2 className="animate-spin" /> : null}
          {busy ? "Disconnecting…" : "Confirm"}
        </Button>
      </div>
      {errored && (
        <p role="alert" className="text-xs text-destructive">
          Couldn&apos;t disconnect — try again.
        </p>
      )}
    </div>
  )
}
