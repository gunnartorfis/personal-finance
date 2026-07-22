import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { NetWorthTrendChart } from "@/components/net-worth-trend-chart"
import type { NetWorthPoint } from "@/lib/dashboard/net-worth"
import { formatDate } from "@/lib/format/date"
import { renderWithIntl as render } from "@/lib/test/render"

const POINTS: NetWorthPoint[] = [
  { asOf: new Date("2026-01-01T00:00:00Z"), total: 1_000_000 },
  { asOf: new Date("2026-02-01T00:00:00Z"), total: 1_100_000 },
  { asOf: new Date("2026-03-01T00:00:00Z"), total: 1_250_000 },
]

const utc = (date: Date) => formatDate(date, "en", { dateStyle: "medium", timeZone: "UTC" })

describe("NetWorthTrendChart", () => {
  it("titles the trend and states the change from first to last observation", () => {
    render(<NetWorthTrendChart points={POINTS} currency="ISK" />)
    expect(screen.getByText("Net worth over time")).toBeInTheDocument()
    // 1,250,000 − 1,000,000 = 250,000 up
    expect(screen.getByText(/Up .*250,000/)).toBeInTheDocument()
  })

  it("shows a decline when net worth fell", () => {
    render(
      <NetWorthTrendChart
        points={[
          { asOf: new Date("2026-01-01T00:00:00Z"), total: 1_000_000 },
          { asOf: new Date("2026-02-01T00:00:00Z"), total: 800_000 },
        ]}
        currency="ISK"
      />
    )
    expect(screen.getByText(/Down .*200,000/)).toBeInTheDocument()
  })

  it("says unchanged when net worth is flat (no misleading 'Up 0')", () => {
    render(
      <NetWorthTrendChart
        points={[
          { asOf: new Date("2026-01-01T00:00:00Z"), total: 1_000_000 },
          { asOf: new Date("2026-02-01T00:00:00Z"), total: 1_000_000 },
        ]}
        currency="ISK"
      />
    )
    expect(screen.getByText(/Unchanged/)).toBeInTheDocument()
    expect(screen.queryByText(/Up .*0/)).not.toBeInTheDocument()
  })

  it("exposes each observed point to screen readers", () => {
    render(<NetWorthTrendChart points={POINTS} currency="ISK" />)
    expect(screen.getByText(new RegExp(`${utc(POINTS[0].asOf)}.*1,000,000`))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`${utc(POINTS[2].asOf)}.*1,250,000`))).toBeInTheDocument()
  })

  it("renders nothing with fewer than two observations (not a trend yet)", () => {
    const { container } = render(
      <NetWorthTrendChart points={[POINTS[0]]} currency="ISK" />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("localizes the section for the is catalog", () => {
    render(<NetWorthTrendChart points={POINTS} currency="ISK" />, { locale: "is" })
    expect(screen.getByText("Hrein eign yfir tíma")).toBeInTheDocument()
  })
})
