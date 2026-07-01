import { describe, expect, it } from "vitest";

import type { MonthlySpendPoint } from "./monthly-series";
import { computeSpendingTrendStats, projectMonth } from "./spending-trend";

/** Build a series point; moneyIn defaults to 0 (irrelevant to the spending trend stats). */
function pt(month: string, spending: number, moneyIn = 0): MonthlySpendPoint {
  return { month, spending, moneyIn, difference: moneyIn - spending };
}

describe("projectMonth", () => {
  it("projects linearly from spend-so-far over elapsed days to the full month (UTC)", () => {
    // Day 10 of March (31 days): 100000 / 10 * 31 = 310000.
    expect(projectMonth(pt("2026-03", 100000), new Date("2026-03-10T12:00:00Z"))).toEqual({
      month: "2026-03",
      spentSoFar: 100000,
      daysElapsed: 10,
      daysInMonth: 31,
      projected: 310000,
    });
  });

  it("rounds the projection and knows February length in a non-leap year", () => {
    // Day 3 of Feb 2026 (28 days): 100 / 3 * 28 = 933.33 -> 933.
    expect(projectMonth(pt("2026-02", 100), new Date("2026-02-03T00:00:00Z"))).toEqual({
      month: "2026-02",
      spentSoFar: 100,
      daysElapsed: 3,
      daysInMonth: 28,
      projected: 933,
    });
  });
});

describe("computeSpendingTrendStats", () => {
  const NOW = new Date("2026-03-10T12:00:00Z"); // current cycle 2026-03, day 10

  it("averages completed months, compares the last completed month, and projects the current one", () => {
    const series = [
      pt("2025-11", 200000),
      pt("2025-12", 400000),
      pt("2026-01", 300000),
      pt("2026-02", 350000),
      pt("2026-03", 100000), // current, in-progress
    ];
    const stats = computeSpendingTrendStats(series, NOW);
    expect(stats.completedMonths).toBe(4);
    expect(stats.hasEnoughHistory).toBe(true);
    expect(stats.trailingAverage).toBe(312500); // (200+400+300+350)k / 4
    expect(stats.lastCompleted).toEqual(pt("2026-02", 350000));
    expect(stats.vsAveragePct).toBe(12); // (350000-312500)/312500 = 12%
    expect(stats.projection).toEqual({
      month: "2026-03",
      spentSoFar: 100000,
      daysElapsed: 10,
      daysInMonth: 31,
      projected: 310000,
    });
  });

  it("excludes gap-filled zero months from the history gate and the average", () => {
    const series = [
      pt("2025-11", 0), // no data (gap-filled)
      pt("2025-12", 0), // no data (gap-filled)
      pt("2026-01", 300000),
      pt("2026-02", 350000),
      pt("2026-03", 100000), // current
    ];
    const stats = computeSpendingTrendStats(series, NOW);
    expect(stats.completedMonths).toBe(2); // only Jan + Feb have data
    expect(stats.hasEnoughHistory).toBe(false); // < 3
    expect(stats.trailingAverage).toBeNull();
    expect(stats.vsAveragePct).toBeNull();
    expect(stats.projection?.projected).toBe(310000); // still projected
  });

  it("caps the average window at maxMonths (drops the oldest completed months)", () => {
    // 13 completed months: the oldest is an outlier that must fall outside a 12-month window.
    const completed = [pt("2025-01", 999999)];
    for (let m = 2; m <= 12; m++) completed.push(pt(`2025-${String(m).padStart(2, "0")}`, 100000));
    completed.push(pt("2026-01", 100000)); // 13th completed
    const series = [...completed, pt("2026-02", 50000)]; // current = 2026-02
    const now = new Date("2026-02-05T00:00:00Z");
    const stats = computeSpendingTrendStats(series, now);
    expect(stats.completedMonths).toBe(13);
    expect(stats.trailingAverage).toBe(100000); // last 12 only -> the 999999 outlier excluded
    expect(stats.vsAveragePct).toBe(0); // last completed 100000 == average
  });

  it("has no projection when the series has no current-month point", () => {
    const series = [pt("2025-12", 300000), pt("2026-01", 350000), pt("2026-02", 320000)];
    const stats = computeSpendingTrendStats(series, NOW); // NOW is 2026-03, absent from series
    expect(stats.projection).toBeNull();
    expect(stats.completedMonths).toBe(3);
    expect(stats.hasEnoughHistory).toBe(true);
  });
});
