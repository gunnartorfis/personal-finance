import { TriangleAlert } from "lucide-react"

import { ReconnectButton } from "@/components/reconnect-button"
import type { ReconnectPrompt, ReconnectReason } from "@/lib/open-banking/reconnect"
import { cn } from "@/lib/utils"

/** Per-reason message; the bank name is filled in at render. */
const REASON_COPY: Record<ReconnectReason, (bank: string) => string> = {
  error: (bank) => `Sync failed for ${bank} — reconnect to resume automatic updates.`,
  expired: (bank) => `Your consent for ${bank} has expired — reconnect to resume automatic updates.`,
  expiring: (bank) => `Your consent for ${bank} is expiring soon — reconnect to keep syncing.`,
}

/**
 * Surfaces bank connections that need re-consent (#116) as "needs attention" cards, each with a
 * Reconnect action that re-runs SCA. Shown on the dashboard action band and the accounts page.
 * Renders nothing when no connection needs attention, so callers can drop it in unconditionally.
 */
export function ConnectionAlerts({
  prompts,
  className,
}: {
  prompts: ReconnectPrompt[]
  className?: string
}) {
  if (prompts.length === 0) return null

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {prompts.map((prompt) => (
        <div
          key={prompt.id}
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3"
        >
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500"
          />
          <p className="min-w-0 flex-1 text-sm">{REASON_COPY[prompt.reason](prompt.institutionName)}</p>
          <ReconnectButton institutionName={prompt.institutionName} className="shrink-0" />
        </div>
      ))}
    </div>
  )
}
