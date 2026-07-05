import { Landmark } from "lucide-react"
import { useTranslations } from "next-intl"

import { DisconnectButton } from "@/components/disconnect-button"
import type { ConnectionView } from "@/lib/open-banking/connections-view"
import { cn } from "@/lib/utils"

/** Statuses that need the user's attention get an amber label; the rest stay muted. */
const ATTENTION_STATUSES = new Set<ConnectionView["status"]>([
  "expiring",
  "expired",
  "error",
])

/**
 * List the household's bank connections and their synced accounts, with a disconnect action (#118).
 * Disconnecting revokes consent and stops sync while retaining history, so a disconnected connection
 * stays listed (marked "Disconnected", its accounts shown) but offers no further action. Renders
 * nothing when the household has no connections. Server component; the disconnect action is a client
 * button.
 */
export function BankConnections({
  connections,
  className,
}: {
  connections: ConnectionView[]
  className?: string
}) {
  const t = useTranslations("bankSync.connections")
  // Localized status label via a guarded switch over known values (no catch-all) so a new status is
  // a type error rather than a silent English fallback.
  function statusLabel(status: ConnectionView["status"]): string {
    switch (status) {
      case "active":
        return t("status.active")
      case "expiring":
        return t("status.expiring")
      case "expired":
        return t("status.expired")
      case "error":
        return t("status.error")
      case "revoked":
        return t("status.revoked")
    }
  }

  if (connections.length === 0) return null

  return (
    <section
      aria-label={t("title")}
      className={cn("flex flex-col gap-3", className)}
    >
      <h2 className="text-sm font-medium">{t("title")}</h2>
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
        {connections.map((connection) => (
          <li key={connection.id} className="flex flex-col gap-3 px-4 py-3">
            <div className="flex items-start gap-3">
              <Landmark
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-sm font-medium">
                  {connection.institutionName}
                </p>
                <p
                  className={cn(
                    "text-xs",
                    ATTENTION_STATUSES.has(connection.status)
                      ? "text-amber-600 dark:text-amber-500"
                      : "text-muted-foreground"
                  )}
                >
                  {statusLabel(connection.status)}
                </p>
              </div>
              {!connection.isDisconnected && (
                <DisconnectButton
                  connectionId={connection.id}
                  institutionName={connection.institutionName}
                />
              )}
            </div>
            {connection.accounts.length > 0 && (
              <ul className="flex flex-col gap-1 pl-7">
                {connection.accounts.map((account) => (
                  <li
                    key={account.id}
                    className="text-sm text-muted-foreground"
                  >
                    {account.name}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
