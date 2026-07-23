"use client"

import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import -- recharts composes by detecting child component types (BarChart reads its Bar/XAxis children), so wrapping these primitives in next/dynamic breaks rendering; recharts is already eagerly bundled via the shared components/ui/chart wrapper, so a dynamic import here yields no code-split. Client-only, code-split at route level.
import { Bar, BarChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { rankCategoryBreakdown, type CategoryBreakdown } from "@/lib/dashboard/category-breakdown"
import { useCategoryLabel } from "@/lib/categories/label"
import { cornerRadius } from "@/lib/charts/corner-radius"
import { currencyFormatter } from "@/lib/format/currency"
import { defaultLocale, toLocale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

/** A Household Category leaf as the chart needs it for label resolution (ADR-0020). */
export interface CategoryChartLeaf {
  id: string
  /** i18n key (namespace `categories`) for a seed row; null on a custom row. */
  labelKey: string | null
  /** Literal label for a custom row; null on a seed row. */
  label: string | null
}

/** Distinct chart colours for the named categories; `topN` is capped to this length below. */
const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]
/** Neutral tone for the collapsed "Other" tail and the Uncategorized remainder. */
const NEUTRAL = "var(--muted-foreground)"

/**
 * Spending-by-**Category** breakdown for the dashboard (ADR-0020) — the parallel to
 * {@link SpendingByType} on the orthogonal semantic axis. A 100%-stacked proportion bar (Recharts)
 * over a colour-keyed amounts legend, fed by {@link rankCategoryBreakdown}: the top few categories
 * by spend, the rest folded into "Other", and any Uncategorized spend last. Pure and prop-driven;
 * renders nothing when there is no expense. Seed categories localize via their `labelKey`; custom
 * ones show their literal label. `headingLevel` lets each caller slot the heading at the right depth.
 */
export function SpendingByCategory({
  breakdown,
  categories,
  currency,
  periodMonths,
  headingLevel = 2,
  className,
}: {
  breakdown: CategoryBreakdown
  categories: CategoryChartLeaf[]
  currency: string
  /** Trailing-window length (months) the breakdown covers — named in the heading (single source of truth). */
  periodMonths: number
  headingLevel?: 2 | 3
  className?: string
}) {
  const t = useTranslations("spendingByCategory")
  const locale = toLocale(useLocale()) ?? defaultLocale
  const labelFor = useCategoryLabel()
  const money = currencyFormatter(currency, locale)
  const fmt = (amount: number) => money.format(amount)

  // Cap to the palette so every named slice gets a distinct colour; the overflow lands in "Other".
  const ranked = rankCategoryBreakdown(breakdown, { topN: PALETTE.length })
  if (ranked.total <= 0) return null

  const labelParts = new Map(categories.map((c) => [c.id, c]))

  // Each ranked row → a chart segment with a stable key, resolved label, colour, and (where it maps
  // to a single filterable bucket) a link to the filtered transactions list. The collapsed "Other"
  // tail has no single id, so it isn't linked; "Uncategorized" filters via the `none` sentinel.
  const segments = ranked.rows.map((row, index) => {
    if (row.kind === "category") {
      const parts = labelParts.get(row.categoryId)
      return {
        key: row.categoryId,
        label: parts ? labelFor(parts) : row.categoryId,
        // Category rows come first and `topN` is capped to PALETTE.length, so `index` is already in
        // range; the modulo is a defensive guard should either of those invariants ever change.
        color: PALETTE[index % PALETTE.length],
        magnitude: row.magnitude,
        href: `/transactions?category=${encodeURIComponent(row.categoryId)}`,
      }
    }
    if (row.kind === "other") {
      return { key: "other", label: t("other", { count: row.count }), color: NEUTRAL, magnitude: row.magnitude, href: null }
    }
    return {
      key: "uncategorized",
      label: t("uncategorized"),
      color: NEUTRAL,
      magnitude: row.magnitude,
      href: "/transactions?category=none",
    }
  })

  const Heading = headingLevel === 3 ? "h3" : "h2"

  const chartConfig = Object.fromEntries(
    segments.map((s) => [s.key, { label: s.label, color: s.color }])
  ) satisfies ChartConfig
  // `stackOffset="expand"` sizes each segment against the sum of rendered magnitudes, so the tooltip
  // shares must use that same sum (which equals `ranked.total`) to add up to 100%.
  const chartData = [
    segments.reduce<Record<string, number | string>>(
      (r, s) => {
        r[s.key] = s.magnitude
        return r
      },
      { row: "spend" }
    ),
  ]

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <Heading className="text-sm font-medium">{t("heading", { months: periodMonths })}</Heading>
        <p className="text-sm text-muted-foreground tabular-nums">
          {t("total", { amount: fmt(ranked.total) })}
        </p>
      </div>

      {/* No `overflow-hidden` here: it would clip the hover tooltip down to the 3px bar. The pill
          shape comes from rounding the first/last bar segments' outer corners instead (below). */}
      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-3 w-full"
      >
        <BarChart
          layout="vertical"
          data={chartData}
          stackOffset="expand"
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        >
          <XAxis type="number" domain={[0, 1]} hide />
          <YAxis type="category" dataKey="row" hide />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, name) => {
                  const label = chartConfig[name as string]?.label ?? name
                  const share = ranked.total > 0 ? (Number(value) / ranked.total) * 100 : 0
                  return (
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="text-foreground tabular-nums">
                        {fmt(Number(value))} · {Math.round(share)}%
                      </span>
                    </span>
                  )
                }}
              />
            }
          />
          {segments.map((s, index) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="spend"
              fill={`var(--color-${s.key})`}
              isAnimationActive={false}
              // Round only the outer corners of the end segments so the stacked bar reads as one pill
              // (the container no longer clips). [topLeft, topRight, bottomRight, bottomLeft].
              radius={cornerRadius(index, segments.length)}
            />
          ))}
        </BarChart>
      </ChartContainer>

      <ul className="flex flex-col gap-2">
        {segments.map((s) => {
          const inner = (
            <>
              <span className="flex items-center gap-2">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                  aria-hidden="true"
                />
                <span className="text-muted-foreground group-hover:text-foreground">{s.label}</span>
              </span>
              <span className="tabular-nums">{fmt(s.magnitude)}</span>
            </>
          )
          return (
            <li key={s.key}>
              {s.href ? (
                // Jump to the transactions list filtered to this category (Uncategorized → `none`).
                <Link
                  href={s.href}
                  className="group -mx-1 flex items-center justify-between gap-3 rounded px-1 py-0.5 text-sm transition-colors hover:bg-muted/50"
                >
                  {inner}
                </Link>
              ) : (
                <div className="flex items-center justify-between gap-3 px-1 py-0.5 text-sm">{inner}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
