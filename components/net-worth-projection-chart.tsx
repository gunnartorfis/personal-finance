"use client"

import { useLocale, useTranslations } from "next-intl"
import { Area, AreaChart, XAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { ProjectionPoint } from "@/lib/dashboard/net-worth"
import { currencyFormatter } from "@/lib/format/currency"
import { formatCycleMonth } from "@/lib/format/date"
import { defaultLocale, toLocale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

/**
 * The 12-month net-worth projection (ADR-0016): today's net worth carried forward at the Household's
 * typical monthly saving, drawn as an area. A screen-reader-only list carries the same figures since
 * the SVG marks aren't accessible. Rendered by the dashboard only when there's a net worth and enough
 * history for a typical-saving figure, so `points` is always a non-empty projection here.
 */
export function NetWorthProjectionChart({
  points,
  currency,
  className,
}: {
  points: ProjectionPoint[]
  currency: string
  className?: string
}) {
  const t = useTranslations("charts.netWorthProjection")
  const locale = toLocale(useLocale()) ?? defaultLocale
  const money = currencyFormatter(currency, locale)
  const fmt = (amount: number) => money.format(amount)

  const chartConfig = {
    netWorth: { label: t("netWorth"), color: "var(--color-emerald-500)" },
  } satisfies ChartConfig

  const data = points.map((point) => ({
    cycle: point.cycleKey,
    label: formatCycleMonth(point.cycleKey, locale, { short: true }),
    netWorth: point.netWorth,
  }))

  const last = points[points.length - 1]

  return (
    <section
      className={cn("flex flex-col gap-4 rounded-xl border border-border bg-card p-6", className)}
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-medium">{t("title")}</h2>
        <p className="text-sm text-pretty text-muted-foreground">
          {t("subtitle", { amount: fmt(last.netWorth) })}
        </p>
      </header>

      <ChartContainer config={chartConfig} className="aspect-auto h-40 w-full">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="net-worth-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-netWorth)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--color-netWorth)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            fontSize={10}
            interval="preserveStartEnd"
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(_label, payload) => {
                  const cycle = payload?.[0]?.payload?.cycle as string | undefined
                  return cycle ? formatCycleMonth(cycle, locale) : ""
                }}
                formatter={(value) => (
                  <span className="flex w-full items-center justify-between gap-3">
                    <span className="text-muted-foreground">{t("netWorth")}</span>
                    <span className="text-foreground tabular-nums">{fmt(Number(value))}</span>
                  </span>
                )}
              />
            }
          />
          <Area
            dataKey="netWorth"
            type="monotone"
            stroke="var(--color-netWorth)"
            strokeWidth={2}
            fill="url(#net-worth-fill)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>

      <ul className="sr-only">
        {points.map((point) => (
          <li key={point.cycleKey}>
            {t("srPoint", { label: formatCycleMonth(point.cycleKey, locale), amount: fmt(point.netWorth) })}
          </li>
        ))}
      </ul>
    </section>
  )
}
