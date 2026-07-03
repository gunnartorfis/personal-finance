import { TriangleAlert } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"

import type { FreeCapStatus } from "@/lib/billing/free-cap-status"
import { cn } from "@/lib/utils"

/**
 * Surfaces the Free-cap state (Phase G). Premium renders nothing (uncapped). A Free household sees
 * its remaining runway as a slim progress meter, and once the cap is reached an alert explains that
 * AI classification has paused while the rest of the app keeps working — pending rows classify on
 * upgrade.
 */
export function FreeCapStatusBanner({
  status,
  className,
}: {
  status: FreeCapStatus
  className?: string
}) {
  const t = useTranslations("freeCap")
  if (status.unlimited) return null

  if (status.paused) {
    return (
      <div
        role="alert"
        className={cn(
          "flex items-start gap-3 rounded-lg border border-border bg-muted px-4 py-3 text-sm",
          className
        )}
      >
        <TriangleAlert
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500"
        />
        <div className="flex flex-col gap-1">
          <p className="font-medium">{t("pausedTitle")}</p>
          <p className="text-muted-foreground">
            {t.rich("pausedBody", {
              cap: status.cap,
              link: (chunks) => (
                <Link
                  href="/settings/billing"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
      </div>
    )
  }

  const pct = status.cap > 0 ? Math.min(100, Math.round((status.used / status.cap) * 100)) : 0

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        aria-hidden="true"
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-foreground/70" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-muted-foreground">
        {t("usage", { used: status.used, cap: status.cap, remaining: status.remaining })}
      </p>
    </div>
  )
}
