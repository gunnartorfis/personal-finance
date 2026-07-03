"use client"

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"

import { CATEGORIES } from "@/components/spending-by-type"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
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

/** Rounded outer corners for a stacked bar: bottom segment rounds its base, top segment its cap. */
function stackRadius(index: number, count: number): [number, number, number, number] {
  const isBottom = index === 0
  const isTop = index === count - 1
  if (isBottom && isTop) return [4, 4, 4, 4]
  if (isTop) return [4, 4, 0, 0]
  if (isBottom) return [0, 0, 4, 4]
  return [0, 0, 0, 0]
}

/**
 * The 100%-normalized "mix over time" chart: one stacked bar per month showing how the spending mix
 * shifts, drawn with Recharts (`stackOffset="expand"`) following shadcn's stacked-bar setup
 * (`accessibilityLayer`, `CartesianGrid`, `ChartLegend`). The screen-reader-only per-month composition
 * summary lives outside the SVG so the mix is legible without a pointer. Prop-driven off the trend.
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

      <ChartContainer config={chartConfig} className="aspect-auto h-44 w-full">
        <BarChart accessibilityLayer data={data} stackOffset="expand">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} tickMargin={10} axisLine={false} />
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
          <ChartLegend content={<ChartLegendContent />} />
          {present.map((category, index) => (
            <Bar
              key={category.slug}
              dataKey={category.slug}
              stackId="mix"
              fill={`var(--color-${category.slug})`}
              radius={stackRadius(index, present.length)}
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
