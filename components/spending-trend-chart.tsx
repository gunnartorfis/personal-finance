"use client"

import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bar, ComposedChart, Line, XAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { currencyFormatter } from "@/lib/format/currency"
import { formatCycleMonth } from "@/lib/format/date"
import { defaultLocale, toLocale } from "@/lib/i18n/config"
import type { MonthlySpendPoint } from "@/lib/dashboard/monthly-series"
import { DEFAULT_TRAILING } from "@/lib/dashboard/spending-trend"
import { cn } from "@/lib/utils"

/**
 * The rolling 12-month spending trend (Phase K, K11): spending as bars with an income overlay line,
 * drawn with Recharts. Clicking a bar opens that cycle on the transactions view; a screen-reader-only
 * list of per-cycle links carries the same navigation and figures for keyboard/AT users, since the
 * SVG marks aren't anchors. Below {@link DEFAULT_TRAILING.minMonths} months of history it shows a
 * keep-uploading placeholder instead of a near-empty chart. Prop-driven off the view-model's `series`.
 */
export function SpendingTrendChart({
  series,
  hasEnoughHistory,
  completedMonths,
  currency,
  className,
}: {
  series: MonthlySpendPoint[]
  hasEnoughHistory: boolean
  completedMonths: number
  currency: string
  className?: string
}) {
  const router = useRouter()
  const t = useTranslations("charts.spendingTrend")
  const locale = toLocale(useLocale()) ?? defaultLocale

  const chartConfig = {
    spending: { label: t("spending"), color: "var(--color-foreground)" },
    income: { label: t("income"), color: "var(--color-emerald-500)" },
  } satisfies ChartConfig

  const money = currencyFormatter(currency, locale)
  const fmt = (amount: number) => money.format(amount)

  // Recharts hands a Bar's onClick the datum (its `payload`); navigate to that cycle. Scoping the
  // handler to the bar — rather than the chart — means only a bar click navigates, never a click on
  // empty plot area (which chart-level onClick would fire off the last hovered index).
  const goToCycle = (entry: unknown) => {
    const month = (entry as { payload?: { month?: string } })?.payload?.month
    if (month) router.push(`/transactions?cycle=${month}`)
  }

  const data = series.map((point) => ({
    month: point.month,
    label: formatCycleMonth(point.month, locale, { short: true }),
    spending: point.spending,
    income: point.income,
  }))

  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-border bg-card p-6",
        className
      )}
    >
      <header className="flex items-center justify-between gap-4">
        <h2 className="text-base font-medium">{t("title")}</h2>
        {hasEnoughHistory && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2 rounded-sm bg-foreground/80"
              />
              {t("spending")}
            </span>
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-0.5 w-3 rounded-full bg-emerald-500"
              />
              {t("income")}
            </span>
          </div>
        )}
      </header>

      {hasEnoughHistory ? (
        <>
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-40 w-full"
          >
            <ComposedChart
              data={data}
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
                    labelFormatter={(_label, payload) => {
                      const month = payload?.[0]?.payload?.month as
                        | string
                        | undefined
                      return month ? formatCycleMonth(month, locale) : ""
                    }}
                    formatter={(value, name) => {
                      const label =
                        chartConfig[name as keyof typeof chartConfig]?.label ??
                        name
                      return (
                        <span className="flex w-full items-center justify-between gap-3">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="text-foreground tabular-nums">
                            {fmt(Number(value))}
                          </span>
                        </span>
                      )
                    }}
                  />
                }
              />
              <Bar
                dataKey="spending"
                fill="var(--color-spending)"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
                cursor="pointer"
                onClick={goToCycle}
              />
              <Line
                dataKey="income"
                type="monotone"
                stroke="var(--color-income)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ChartContainer>

          <ul className="sr-only">
            {series.map((point) => (
              <li key={point.month}>
                <Link href={`/transactions?cycle=${point.month}`}>
                  {t("srLink", {
                    label: formatCycleMonth(point.month, locale),
                    spending: fmt(point.spending),
                    income: fmt(point.income),
                  })}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="flex h-32 flex-col items-center justify-center gap-1 rounded-lg bg-muted px-4 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{t("notEnoughTitle")}</p>
          <p>
            {t("notEnoughBody", {
              completed: completedMonths,
              min: DEFAULT_TRAILING.minMonths,
            })}
          </p>
        </div>
      )}
    </section>
  )
}
