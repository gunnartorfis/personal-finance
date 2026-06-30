import type { FreeCapStatus } from "@/lib/billing/free-cap-status"
import { cn } from "@/lib/utils"

/**
 * Surfaces the Free-cap state (Phase G). Premium renders nothing (uncapped). A Free household sees
 * its remaining runway, and once the cap is reached an alert explains that AI classification has
 * paused while the rest of the app keeps working — pending rows classify on upgrade.
 */
export function FreeCapStatusBanner({
  status,
  className,
}: {
  status: FreeCapStatus
  className?: string
}) {
  if (status.unlimited) return null

  if (status.paused) {
    return (
      <div
        role="alert"
        className={cn("rounded-md border border-border bg-muted px-4 py-3 text-sm", className)}
      >
        <p className="font-medium">AI classification paused</p>
        <p className="text-muted-foreground">
          You&apos;ve used all {status.cap} free classifications. Uploads, the dashboard and overrides
          keep working; upgrade to Premium to classify the rest.
        </p>
      </div>
    )
  }

  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      {status.used} of {status.cap} free AI classifications used — {status.remaining} left.
    </p>
  )
}
