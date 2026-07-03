"use client"

import { Bar, BarChart, XAxis } from "recharts"

import { CATEGORIES } from "@/components/spending-by-type"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { CategoryTrendPoint } from "@/lib/dashboard/category-trend"
import type { CycleKey } from "@/lib/dashboard/cycle"
import { cycleKeyLabel, shortCycleLabel } from "@/lib/dashboard/cycle"

/** Positive magnitude for one display category within a month. */
function magnitudeFor(point: CategoryTrendPoint, key: (typeof CATEGORIES)[number]["key"]) {
  if (key === "Other") return point.byExpenseType[""]
  if (key === "Unclassified") return point.unclassified
  return point.byExpenseType[key]
}

/** Accessible description of one month's mix, e.g. "March 2026 spending mix: Fixed 60%, Nice to have 40%". */
function mixLabel(month: CycleKey, point: CategoryTrendPoint): string {
  const magnitudes = CATEGORIES.map((category) => ({
    label: category.label,
    magnitude: magnitudeFor(point, category.key),
  }))
  const total = magnitudes.reduce((sum, item) => sum + item.magnitude, 0)
  const label = cycleKeyLabel(month)
  if (total === 0) return `${label}: no spending recorded`
  const parts = magnitudes
    .filter((item) => item.magnitude > 0)
    .map((item) => `${item.label} ${Math.round((item.magnitude / total) * 100)}%`)
  return `${label} spending mix: ${parts.join(", ")}`
}

/**
 * The 100%-normalized "mix over time" chart: one stacked bar per month showing how the spending mix
 * shifts, drawn with Recharts (`stackOffset="expand"`). The colour-keyed HTML legend and the
 * screen-reader-only per-month composition summary live outside the SVG so the mix is legible without
 * a pointer and testable without a laid-out chart. Prop-driven off the dashboard view-model's trend.
 */
export function MixOverTimeChart({
  categoryTrend,
  currency,
}: {
  categoryTrend: CategoryTrendPoint[]
  currency: string
}) {
  const fmt = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount)

  // Only the categories that actually appear in at least one month, in CATEGORIES order, so neither
  // the legend nor the stack ever carries an empty bucket.
  const present = CATEGORIES.filter((category) =>
    categoryTrend.some((point) => magnitudeFor(point, category.key) > 0)
  )

  const chartConfig = Object.fromEntries(
    present.map((category) => [category.slug, { label: category.label, theme: category.color }])
  ) satisfies ChartConfig

  const data = categoryTrend.map((point) => {
    const row: Record<string, number | string> = {
      month: point.month,
      label: shortCycleLabel(point.month),
    }
    for (const category of present) row[category.slug] = magnitudeFor(point, category.key)
    return row
  })

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">Mix over time</h3>

      {present.length > 0 && (
        <ul role="list" className="flex flex-wrap gap-x-3 gap-y-1">
          {present.map((category) => (
            <li
              key={category.key}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <span
                className={`size-2 shrink-0 rounded-full ${category.swatch}`}
                aria-hidden="true"
              />
              {category.label}
            </li>
          ))}
        </ul>
      )}

      <ChartContainer config={chartConfig} className="aspect-auto h-28 w-full">
        <BarChart
          data={data}
          stackOffset="expand"
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
        >
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            fontSize={10}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                formatter={(value, name) => {
                  const label = chartConfig[name as string]?.label ?? name
                  return (
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="tabular-nums text-foreground">{fmt(Number(value))}</span>
                    </span>
                  )
                }}
              />
            }
          />
          {present.map((category, index) => (
            <Bar
              key={category.slug}
              dataKey={category.slug}
              stackId="mix"
              fill={`var(--color-${category.slug})`}
              radius={index === present.length - 1 ? [2, 2, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ChartContainer>

      <ul className="sr-only">
        {categoryTrend.map((point) => (
          <li key={point.month}>{mixLabel(point.month, point)}</li>
        ))}
      </ul>
    </div>
  )
}
