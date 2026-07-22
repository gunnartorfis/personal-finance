import { describe, expect, it } from "vitest"

import type { NetWorthPoint } from "./net-worth"
import { computeSavingsGap } from "./savings-gap"

const nw = (asOf: string, total: number): NetWorthPoint => ({ asOf: new Date(asOf), total })

describe("computeSavingsGap", () => {
  it("reports inferred saving minus the observed net-worth change for a cycle with a baseline", () => {
    const series = [nw("2026-01-15T00:00:00Z", 1_000_000), nw("2026-02-20T00:00:00Z", 1_100_000)]
    // Cycle 2026-02: start net worth 1,000,000 (Jan 15 carried forward), end 1,100,000 → observed +100,000.
    expect(computeSavingsGap([{ cycleKey: "2026-02", inferred: 150_000 }], series)).toEqual([
      { cycleKey: "2026-02", inferred: 150_000, observedDelta: 100_000, gap: 50_000 },
    ])
  })

  it("marks a cycle uncovered when a baseline exists but no fresh snapshot lands during it", () => {
    const series = [nw("2026-01-15T00:00:00Z", 1_000_000)] // only a January snapshot
    // February has a baseline (Jan 15 carried forward) but no new reading → unobserved, not a real 0.
    expect(computeSavingsGap([{ cycleKey: "2026-02", inferred: 150_000 }], series)).toEqual([
      { cycleKey: "2026-02", inferred: 150_000, observedDelta: null, gap: null },
    ])
  })

  it("marks a cycle uncovered (null delta and gap) when no snapshot precedes its start", () => {
    const series = [nw("2026-01-15T00:00:00Z", 1_000_000)]
    // Cycle 2026-01 starts 2026-01-01, before the first snapshot → no baseline to measure from.
    expect(computeSavingsGap([{ cycleKey: "2026-01", inferred: 80_000 }], series)).toEqual([
      { cycleKey: "2026-01", inferred: 80_000, observedDelta: null, gap: null },
    ])
  })

  it("shares boundaries across consecutive cycles (end of one is the start of the next)", () => {
    const series = [
      nw("2025-12-31T00:00:00Z", 500_000),
      nw("2026-01-31T00:00:00Z", 560_000),
      nw("2026-02-28T00:00:00Z", 600_000),
    ]
    expect(
      computeSavingsGap(
        [
          { cycleKey: "2026-01", inferred: 70_000 },
          { cycleKey: "2026-02", inferred: 50_000 },
        ],
        series
      )
    ).toEqual([
      // Jan: 560,000 − 500,000 = +60,000 observed; gap 70,000 − 60,000 = 10,000
      { cycleKey: "2026-01", inferred: 70_000, observedDelta: 60_000, gap: 10_000 },
      // Feb: 600,000 − 560,000 = +40,000 observed; gap 50,000 − 40,000 = 10,000
      { cycleKey: "2026-02", inferred: 50_000, observedDelta: 40_000, gap: 10_000 },
    ])
  })

  it("is empty for no cycles", () => {
    expect(computeSavingsGap([], [nw("2026-01-01T00:00:00Z", 1)])).toEqual([])
  })
})
