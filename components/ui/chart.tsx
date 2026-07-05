"use client"

import * as React from "react"
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import -- shared shadcn chart wrapper that re-exports many recharts primitives (ResponsiveContainer, Tooltip, Legend) and is imported by every leaf chart; recharts composes by detecting child component types, so converting these re-exports to next/dynamic breaks composition/types/SSR. Client-only; code-split at route level.
import * as RechartsPrimitive from "recharts"
import type { TooltipValueType } from "recharts"

import { cn } from "@/lib/utils"

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const

const INITIAL_DIMENSION = { width: 320, height: 200 } as const
type TooltipNameType = number | string

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
>

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.use(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }

  return context
}

function ChartContainer({
  id,
  className,
  children,
  config,
  initialDimension = INITIAL_DIMENSION,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"]
  initialDimension?: {
    width: number
    height: number
  }
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`
  const contextValue = React.useMemo(() => ({ config }), [config])

  return (
    <ChartContext.Provider value={contextValue}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer
          initialDimension={initialDimension}
        >
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([, config]) => config.theme ?? config.color
  )

  if (!colorConfig.length) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color =
      itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ??
      itemConfig.color
    return color ? `  --color-${key}: ${color};` : null
  })
  .join("\n")}
}
`
          )
          .join("\n"),
      }}
    />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

type ChartTooltipContentProps = React.ComponentProps<
  typeof RechartsPrimitive.Tooltip
> &
  React.ComponentProps<"div"> & {
    hideLabel?: boolean
    hideIndicator?: boolean
    indicator?: "line" | "dot" | "dashed"
    nameKey?: string
    labelKey?: string
  } & Omit<
    RechartsPrimitive.DefaultTooltipContentProps<
      TooltipValueType,
      TooltipNameType
    >,
    "accessibilityLayer"
  >

// Memoized so the parent's early return (inactive / empty payload) skips this label work entirely
// instead of computing it every render before bailing out.
const ChartTooltipLabel = React.memo(function ChartTooltipLabel({
  hideLabel,
  payload,
  labelKey,
  label,
  labelFormatter,
  labelClassName,
  config,
}: Pick<
  ChartTooltipContentProps,
  "hideLabel" | "payload" | "labelKey" | "label" | "labelFormatter" | "labelClassName"
> & { config: ChartConfig }) {
  if (hideLabel || !payload?.length) {
    return null
  }

  const [item] = payload
  const key = `${labelKey ?? item?.dataKey ?? item?.name ?? "value"}`
  const itemConfig = getPayloadConfigFromPayload(config, item, key)
  const value =
    !labelKey && typeof label === "string"
      ? (config[label]?.label ?? label)
      : itemConfig?.label

  if (labelFormatter) {
    return (
      <div className={cn("font-medium", labelClassName)}>
        {labelFormatter(value, payload)}
      </div>
    )
  }

  if (!value) {
    return null
  }

  return <div className={cn("font-medium", labelClassName)}>{value}</div>
})

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
}: ChartTooltipContentProps) {
  const { config } = useChart()

  if (!active || !payload?.length) {
    return null
  }

  const nestLabel = payload.length === 1 && indicator !== "dot"

  const tooltipLabel = (
    <ChartTooltipLabel
      hideLabel={hideLabel}
      payload={payload}
      labelKey={labelKey}
      label={label}
      labelFormatter={labelFormatter}
      labelClassName={labelClassName}
      config={config}
    />
  )

  // Single pass over the payload: filter out "none" segments and build each row, preserving the
  // filtered index passed to `formatter` (the position among rendered items, not the raw payload).
  const rows: React.ReactNode[] = []
  let index = 0
  for (const item of payload) {
    if (item.type === "none") continue
    const key = `${nameKey ?? item.name ?? item.dataKey ?? "value"}`
    const itemConfig = getPayloadConfigFromPayload(config, item, key)
    const indicatorColor = color ?? item.payload?.fill ?? item.color
    const rowIndex = index
    index++

    rows.push(
      <div
        key={String(item.dataKey ?? key)}
        className={cn(
          "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
          indicator === "dot" && "items-center"
        )}
      >
        {formatter && item?.value !== undefined && item.name ? (
          formatter(item.value, item.name, item, rowIndex, item.payload)
        ) : (
          <>
            {itemConfig?.icon ? (
              <itemConfig.icon />
            ) : (
              !hideIndicator && (
                <div
                  className={cn(
                    "shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)",
                    {
                      "h-2.5 w-2.5": indicator === "dot",
                      "w-1": indicator === "line",
                      "w-0 border-[1.5px] border-dashed bg-transparent":
                        indicator === "dashed",
                      "my-0.5": nestLabel && indicator === "dashed",
                    }
                  )}
                  style={
                    {
                      "--color-bg": indicatorColor,
                      "--color-border": indicatorColor,
                    } as React.CSSProperties
                  }
                />
              )
            )}
            <div
              className={cn(
                "flex flex-1 justify-between leading-none",
                nestLabel ? "items-end" : "items-center"
              )}
            >
              <div className="grid gap-1.5">
                {nestLabel ? tooltipLabel : null}
                <span className="text-muted-foreground">
                  {itemConfig?.label ?? item.name}
                </span>
              </div>
              {item.value != null && (
                <span className="font-mono font-medium text-foreground tabular-nums">
                  {typeof item.value === "number"
                    ? item.value.toLocaleString()
                    : String(item.value)}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "grid min-w-32 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs/relaxed shadow-xl",
        className
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">{rows}</div>
    </div>
  )
}

const ChartLegend = RechartsPrimitive.Legend

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey,
}: React.ComponentProps<"div"> & {
  hideIcon?: boolean
  nameKey?: string
} & RechartsPrimitive.DefaultLegendContentProps) {
  const { config } = useChart()

  if (!payload?.length) {
    return null
  }

  // Single pass: skip "none" entries and build each legend item with a stable per-series key.
  const items: React.ReactNode[] = []
  for (const item of payload) {
    if (item.type === "none") continue
    const key = `${nameKey ?? item.dataKey ?? "value"}`
    const itemConfig = getPayloadConfigFromPayload(config, item, key)

    items.push(
      <div
        key={String(item.dataKey ?? key)}
        className={cn(
          "flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground"
        )}
      >
        {itemConfig?.icon && !hideIcon ? (
          <itemConfig.icon />
        ) : (
          <div
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{
              backgroundColor: item.color,
            }}
          />
        )}
        {itemConfig?.label}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className
      )}
    >
      {items}
    </div>
  )
}

function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string
) {
  if (typeof payload !== "object" || payload === null) {
    return undefined
  }

  const payloadPayload =
    "payload" in payload &&
    typeof payload.payload === "object" &&
    payload.payload !== null
      ? payload.payload
      : undefined

  let configLabelKey: string = key

  if (
    key in payload &&
    typeof payload[key as keyof typeof payload] === "string"
  ) {
    configLabelKey = payload[key as keyof typeof payload] as string
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === "string"
  ) {
    configLabelKey = payloadPayload[
      key as keyof typeof payloadPayload
    ] as string
  }

  return configLabelKey in config ? config[configLabelKey] : config[key]
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
}
