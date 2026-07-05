"use client"

// react-doctor-disable-next-line react-doctor/prefer-dynamic-import -- recharts composes by detecting child component types (RadialBarChart reads its RadialBar/PolarAngleAxis children), so wrapping these primitives in next/dynamic breaks rendering; recharts is already eagerly bundled via the shared components/ui/chart wrapper, so a dynamic import here yields no code-split. Client-only, code-split at route level.
import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts"

import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { cn } from "@/lib/utils"

/**
 * A compact circular progress gauge drawn with Recharts (`RadialBarChart` + a full-circle
 * `PolarAngleAxis` domain so the arc fills `percent`/100 of the ring, over a muted background track).
 * The value is clamped to 0–100. The ARIA role lives on the wrapper — `meter` for a steady reading
 * (savings goal), `progressbar` for a task advancing to completion (classification) — with the SVG
 * marked `aria-hidden`, since the wrapper already conveys the value. The centred `%` is the label.
 */
export function RadialProgress({
  percent,
  label,
  role = "meter",
  tone = "primary",
  className,
}: {
  percent: number
  label: string
  role?: "meter" | "progressbar"
  tone?: "primary" | "success"
  className?: string
}) {
  const value = Math.max(0, Math.min(100, Math.round(percent)))
  const config = {
    value: {
      label,
      color: tone === "success" ? "var(--color-emerald-500)" : "var(--color-primary)",
    },
  } satisfies ChartConfig

  return (
    <div
      role={role}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("relative shrink-0", className)}
    >
      <ChartContainer config={config} className="aspect-square size-full" aria-hidden="true">
        <RadialBarChart
          data={[{ name: "value", value, fill: "var(--color-value)" }]}
          startAngle={90}
          endAngle={-270}
          innerRadius="72%"
          outerRadius="100%"
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
          <RadialBar dataKey="value" background cornerRadius={20} isAnimationActive={false} />
        </RadialBarChart>
      </ChartContainer>
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center text-xs font-medium tabular-nums"
      >
        {value}%
      </span>
    </div>
  )
}
