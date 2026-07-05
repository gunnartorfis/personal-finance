"use client"

import { useLocale, useTranslations } from "next-intl"
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import -- recharts composes by detecting child component types (BarChart reads its Bar/XAxis children), so wrapping these primitives in next/dynamic breaks rendering; recharts is already eagerly bundled via the shared components/ui/chart wrapper, so a dynamic import here yields no code-split. Client-only, code-split at route level.
import { Bar, BarChart, XAxis, YAxis } from "recharts"

import { CATEGORIES } from "@/components/spending-categories"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { useCategoryLabels } from "@/lib/category-labels"
import { currencyFormatter } from "@/lib/format/currency"
import { defaultLocale, toLocale } from "@/lib/i18n/config"
import type { NetSummary } from "@/lib/dashboard/net-summary"
import { cn } from "@/lib/utils"

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
  const t = useTranslations("spendingByType")
  const locale = toLocale(useLocale()) ?? defaultLocale
  const categoryLabels = useCategoryLabels()
  const money = currencyFormatter(currency, locale)
  const fmt = (amount: number) => money.format(amount)

  const totalExpense = Math.abs(summary.expense)

  const breakdown = CATEGORIES.reduce<
    (((typeof CATEGORIES)[number]) & { magnitude: number })[]
  >((acc, category) => {
    const magnitude = Math.abs(
      category.key === "Other"
        ? summary.byExpenseType[""]
        : category.key === "Unclassified"
          ? summary.unclassified
          : summary.byExpenseType[category.key]
    )
    if (magnitude > 0) acc.push({ ...category, magnitude })
    return acc
  }, [])

  if (totalExpense <= 0) return null

  const Heading = headingLevel === 3 ? "h3" : "h2"

  const chartConfig = Object.fromEntries(
    breakdown.map((category) => [
      category.slug,
      { label: categoryLabels[category.key], theme: category.color },
    ])
  ) satisfies ChartConfig
  // Denominator for the tooltip shares. `stackOffset="expand"` sizes each segment against the sum of
  // the rendered magnitudes, so the tooltip must use that same sum (not `totalExpense`, which can
  // diverge from it) for the percentages to match the bar widths and add up to 100%.
  const breakdownTotal = breakdown.reduce(
    (sum, category) => sum + category.magnitude,
    0
  )
  // One row; each present category is a stacked segment. `stackOffset="expand"` normalises the row
  // to 100%, so segment widths read as shares of total spend.
  const chartData = [
    breakdown.reduce<Record<string, number | string>>(
      (row, category) => {
        row[category.slug] = category.magnitude
        return row
      },
      { row: "spend" }
    ),
  ]

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <Heading className="text-sm font-medium">{t("heading")}</Heading>
        <p className="text-sm text-muted-foreground tabular-nums">
          {t("total", { amount: fmt(totalExpense) })}
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
                  const share =
                    breakdownTotal > 0
                      ? (Number(value) / breakdownTotal) * 100
                      : 0
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

      <ul className="flex flex-col gap-2">
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
              <span className="text-muted-foreground">
                {categoryLabels[category.key]}
              </span>
            </span>
            <span className="tabular-nums">{fmt(category.magnitude)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
