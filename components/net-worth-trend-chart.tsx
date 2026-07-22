"use client"

import { useLocale, useTranslations } from "next-intl"
import { useId } from "react"
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import -- recharts composes by detecting child component types (AreaChart reads its Area/XAxis children), so wrapping these primitives in next/dynamic breaks rendering; recharts is already eagerly bundled via the shared components/ui/chart wrapper, so a dynamic import here yields no code-split. Client-only, code-split at route level.
import { Area, AreaChart, XAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { NetWorthPoint } from "@/lib/dashboard/net-worth"
import { currencyFormatter } from "@/lib/format/currency"
import { formatDate } from "@/lib/format/date"
import { defaultLocale, toLocale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

/**
 * The observed net-worth trend (ADR-0016, plan 007 slice 5): the Household's actual net worth at each
 * recorded Balance snapshot, drawn as an area — distinct from the straight-line
 * {@link NetWorthProjectionChart} forecast. A screen-reader-only list carries the same figures since
 * the SVG marks aren't accessible. Renders nothing until there are at least two observations (a single
 * point is not a trend); dates are UTC-anchored so SSR and client agree.
 */
export function NetWorthTrendChart({
  points,
  currency,
  className,
}: {
  points: NetWorthPoint[]
  currency: string
  className?: string
}) {
  const t = useTranslations("charts.netWorthTrend")
  const locale = toLocale(useLocale()) ?? defaultLocale
  const money = currencyFormatter(currency, locale)
  const fmt = (amount: number) => money.format(amount)
  const label = (date: Date) => formatDate(date, locale, { dateStyle: "medium", timeZone: "UTC" })
  // Unique per instance so two charts on one page don't share (and clip to) one gradient.
  const fillId = `net-worth-trend-fill-${useId().replace(/:/g, "")}`

  const chartConfig = {
    netWorth: { label: t("netWorth"), color: "var(--color-emerald-500)" },
  } satisfies ChartConfig

  // A trend needs at least two observations; the dashboard also gates on this.
  if (points.length < 2) return null

  const data = points.map((point) => ({
    key: point.asOf.toISOString(),
    label: label(point.asOf),
    netWorth: point.total,
  }))
  const first = points[0]
  const last = points[points.length - 1]
  const change = last.total - first.total

  return (
    <section
      className={cn("flex flex-col gap-4 rounded-xl border border-border bg-card p-6", className)}
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-medium">{t("title")}</h2>
        <p className="text-sm text-pretty text-muted-foreground">
          {t(change >= 0 ? "subtitleUp" : "subtitleDown", {
            amount: fmt(Math.abs(change)),
            from: label(first.asOf),
            to: label(last.asOf),
          })}
        </p>
      </header>

      <ChartContainer config={chartConfig} className="aspect-auto h-40 w-full">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
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
            fill={`url(#${fillId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>

      <ul className="sr-only">
        {points.map((point) => (
          <li key={point.asOf.toISOString()}>
            {t("srPoint", { label: label(point.asOf), amount: fmt(point.total) })}
          </li>
        ))}
      </ul>
    </section>
  )
}
