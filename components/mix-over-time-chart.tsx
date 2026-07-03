"use client"

import type { ReactElement } from "react"
import { Bar, BarChart, CartesianGrid, Rectangle, XAxis } from "recharts"

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

/** Geometry + row payload Recharts hands a Bar's `shape` callback for each rendered segment. */
/** Geometry + row payload Recharts hands a Bar's `shape` callback for each rendered segment. */
type SegmentShapeProps = {
  x?: number
  y?: number
  width?: number
  height?: number
  fill?: string
  payload?: Record<string, number | string>
}

/**
 * Round only the segments that are actually the top/bottom of the stack *for their own month*.
 * A per-Bar `radius` can't do this: the topmost category varies month to month (a month with no
 * "Other" is capped by "Nice to have"), so each segment reads its row's precomputed `__top`/`__bottom`
 * slug (see the data build below). Shapes are cached per slug at module scope — there are only a
 * handful of category slugs — so mapping the Bars on each render reuses stable component references.
 */
const segmentShapes = new Map<string, (props: SegmentShapeProps) => ReactElement>()
function segmentShapeFor(slug: string) {
  const cached = segmentShapes.get(slug)
  if (cached) return cached
  const Segment = (props: SegmentShapeProps): ReactElement => {
    const { height = 0, payload } = props
    if (height <= 0 || !payload) return <g />
    const r = 4
    const isTop = payload.__top === slug
    const isBottom = payload.__bottom === slug
    return (
      <Rectangle
        {...props}
        radius={[isTop ? r : 0, isTop ? r : 0, isBottom ? r : 0, isBottom ? r : 0]}
      />
    )
  }
  segmentShapes.set(slug, Segment)
  return Segment
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
    // Precompute which categories are the visible base/cap of *this* month's stack so each segment
    // shape can round the true ends without knowing the whole stack.
    const nonzero = present.filter((category) => Number(row[category.slug]) > 0)
    if (nonzero.length > 0) {
      row.__bottom = nonzero[0].slug
      row.__top = nonzero[nonzero.length - 1].slug
    }
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
          {present.map((category) => (
            <Bar
              key={category.slug}
              dataKey={category.slug}
              stackId="mix"
              fill={`var(--color-${category.slug})`}
              shape={segmentShapeFor(category.slug)}
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
