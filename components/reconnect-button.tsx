"use client"

import { Loader2, RefreshCw } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Re-run bank consent for a connection whose consent expired or whose sync errored (#116). Posts the
 * stored institution to the connect route and sends the user to the bank's SCA redirect. All
 * supported banks are Icelandic, so the country is fixed to IS (the connection doesn't store one).
 * On failure it surfaces an inline message rather than navigating away.
 */
export function ReconnectButton({
  institutionName,
  className,
}: {
  institutionName: string
  className?: string
}) {
  const t = useTranslations("bankSync.reconnect")
  const [busy, setBusy] = useState(false)
  const [errored, setErrored] = useState(false)

  async function reconnect() {
    setBusy(true)
    setErrored(false)
    try {
      const res = await fetch("/api/open-banking/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ institutionName, country: "IS" }),
      })
      if (!res.ok) throw new Error("reconnect failed")
      const { url } = (await res.json()) as { url: string }
      window.location.assign(url)
    } catch {
      setErrored(true)
      setBusy(false)
    }
    // On success the assign() navigates away, so busy intentionally stays true until unload.
  }

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => void reconnect()}
        disabled={busy}
        aria-label={t("aria", { bank: institutionName })}
      >
        {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        {busy ? t("reconnecting") : t("reconnect")}
      </Button>
      {errored && (
        <p role="alert" className="text-xs text-destructive">
          {t("error")}
        </p>
      )}
    </div>
  )
}
