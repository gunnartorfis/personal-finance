"use client"

import { Bar, BarChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { NetSummary } from "@/lib/dashboard/net-summary"
import { cn } from "@/lib/utils"

/**
 * Spending categories in display order. `swatch` is the Tailwind class for the HTML legend dots;
 * `color` is the raw (theme-aware) fill fed to Recharts — both drawn from the same source so the
 * chart marks and their legend never drift. The three real expense types get distinct hues; the
 * unbucketed (`""` → "Other") and not-yet-classified totals share a neutral so the eye reads them as
 * "no category". `slug` is the CSS-/dataKey-safe id used for Recharts stacks and `--color-*` vars.
 */
export const CATEGORIES = [
  {
    key: "Fixed",
    slug: "fixed",
    label: "Fixed",
    swatch: "bg-emerald-500",
    color: { light: "var(--color-emerald-500)", dark: "var(--color-emerald-500)" },
  },
  {
    key: "Necessary",
    slug: "necessary",
    label: "Necessary",
    swatch: "bg-amber-500",
    color: { light: "var(--color-amber-500)", dark: "var(--color-amber-500)" },
  },
  {
    key: "Nice to have",
    slug: "nice-to-have",
    label: "Nice to have",
    swatch: "bg-rose-500",
    color: { light: "var(--color-rose-500)", dark: "var(--color-rose-500)" },
  },
  {
    key: "Other",
    slug: "other",
    label: "Other",
    swatch: "bg-zinc-400 dark:bg-zinc-500",
    color: { light: "var(--color-zinc-400)", dark: "var(--color-zinc-500)" },
  },
  {
    key: "Unclassified",
    slug: "unclassified",
    label: "Unclassified",
    swatch: "bg-zinc-300 dark:bg-zinc-700",
    color: { light: "var(--color-zinc-300)", dark: "var(--color-zinc-700)" },
  },
] as const

/**
 * Spending-by-type breakdown shared by the transactions period overview ({@link CycleSummary}) and
 * the dashboard net card ({@link NetSummaryCard}) so both surfaces read identically: a 100%-stacked
 * proportion bar (Recharts) over a colour-keyed amounts legend. Pure and prop-driven; renders nothing
 * when there is no expense. Amounts come in signed and are shown as magnitudes. `headingLevel` lets
 * each caller slot the "Spending by type" heading at the right depth in its surrounding hierarchy.
 */
export function SpendingByType({
  summary,
  currency,
  headingLevel = 2,
  className,
}: {
  summary: NetSummary
  currency: string
  headingLevel?: 2 | 3
  className?: string
}) {
  const fmt = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount)

  const totalExpense = Math.abs(summary.expense)

  const breakdown = CATEGORIES.map((category) => {
    const magnitude = Math.abs(
      category.key === "Other"
        ? summary.byExpenseType[""]
        : category.key === "Unclassified"
          ? summary.unclassified
          : summary.byExpenseType[category.key]
    )
    return { ...category, magnitude }
  }).filter((category) => category.magnitude > 0)

  if (totalExpense <= 0) return null

  const Heading = headingLevel === 3 ? "h3" : "h2"

  const chartConfig = Object.fromEntries(
    breakdown.map((category) => [category.slug, { label: category.label, theme: category.color }])
  ) satisfies ChartConfig
  // One row; each present category is a stacked segment. `stackOffset="expand"` normalises the row
  // to 100%, so segment widths read as shares of total spend.
  const chartData = [
    breakdown.reduce<Record<string, number | string>>((row, category) => {
      row[category.slug] = category.magnitude
      return row
    }, { row: "spend" }),
  ]

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <Heading className="text-sm font-medium">Spending by type</Heading>
        <p className="text-sm text-muted-foreground tabular-nums">
          {fmt(totalExpense)} total
        </p>
      </div>

      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-3 w-full overflow-hidden rounded-full"
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
                  const share = totalExpense > 0 ? (Number(value) / totalExpense) * 100 : 0
                  return (
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="tabular-nums text-foreground">
                        {fmt(Number(value))} · {Math.round(share)}%
                      </span>
                    </span>
                  )
                }}
              />
            }
          />
          {breakdown.map((category) => (
            <Bar
              key={category.slug}
              dataKey={category.slug}
              stackId="spend"
              fill={`var(--color-${category.slug})`}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ChartContainer>

      <ul role="list" className="flex flex-col gap-2">
        {breakdown.map((category) => (
          <li
            key={category.key}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="flex items-center gap-2">
              <span
                className={cn("size-2 shrink-0 rounded-full", category.swatch)}
                aria-hidden="true"
              />
              <span className="text-muted-foreground">{category.label}</span>
            </span>
            <span className="tabular-nums">{fmt(category.magnitude)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
