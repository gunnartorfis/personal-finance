import { ChevronRight } from "lucide-react"
import Link from "next/link"

import { RadialProgress } from "@/components/radial-progress"
import { currencyFormatter } from "@/lib/format/currency"
import type { Locale } from "@/lib/i18n/config"
import type { SavingsProgress } from "@/lib/savings/progress"
import { cn } from "@/lib/utils"

/**
 * The compact Savings-goal progress card (ADR-0007, Phase J): inferred saved-to-date against the
 * target with a progress meter, linking to `/savings` for the full check-in view. Hidden entirely
 * until a goal exists — the Savings page is where one gets set up.
 */
export function SavingsProgressCard({
  progress,
  locale,
  className,
}: {
  progress: SavingsProgress | null
  locale: Locale
  className?: string
}) {
  if (!progress) return null
  const format = currencyFormatter(progress.currency, locale)

  return (
    <Link
      href="/savings"
      aria-label="Savings goal"
      className={cn(
        "group flex items-center gap-4 rounded-xl border border-border bg-card p-6 transition-colors hover:bg-accent/50",
        className
      )}
    >
      <RadialProgress
        percent={progress.percent}
        label="Progress toward the savings goal"
        className="size-12"
      />
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="truncate text-sm font-medium">Savings goal</p>
        <p className="text-sm tabular-nums">
          <span className="font-semibold">{format.format(progress.saved)}</span>{" "}
          <span className="text-muted-foreground">of {format.format(progress.target)}</span>
        </p>
      </div>
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  )
}
