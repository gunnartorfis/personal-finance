import { describe, expect, it } from "vitest";

import { computeRecurringCharges } from "./recurring";

// A fixed "now" in the middle of a month; the window looks back 6 calendar months (Nov 2025 – Apr 2026).
const NOW = new Date("2026-04-15T00:00:00Z");

const charge = (date: string, merchant: string, amount: number) => ({ date, merchant, amount });

describe("computeRecurringCharges", () => {
  it("detects a merchant charged the same amount for three consecutive months", () => {
    const summary = computeRecurringCharges(
      [
        charge("2026-02-03", "NETFLIX", -1_990),
        charge("2026-03-03", "NETFLIX", -1_990),
        charge("2026-04-03", "NETFLIX", -1_990),
      ],
      NOW,
    );
    expect(summary.subscriptions).toEqual([
      { merchant: "NETFLIX", monthlyAmount: 1_990, occurrences: 3, lastMonth: "2026-04" },
    ]);
    expect(summary.committedMonthlyTotal).toBe(1_990);
  });

  it("ignores a merchant seen in fewer than minOccurrences months", () => {
    const summary = computeRecurringCharges(
      [charge("2026-03-03", "SPOTIFY", -1_490), charge("2026-04-03", "SPOTIFY", -1_490)],
      NOW,
    );
    expect(summary.subscriptions).toEqual([]);
    expect(summary.committedMonthlyTotal).toBe(0);
  });

  it("ignores credits (refunds are not subscriptions)", () => {
    const summary = computeRecurringCharges(
      [
        charge("2026-02-03", "REFUNDY", 1_000),
        charge("2026-03-03", "REFUNDY", 1_000),
        charge("2026-04-03", "REFUNDY", 1_000),
      ],
      NOW,
    );
    expect(summary.subscriptions).toEqual([]);
  });

  it("merges store-number variants of one merchant via normalization", () => {
    const summary = computeRecurringCharges(
      [
        charge("2026-02-03", "netflix 045", -1_990),
        charge("2026-03-03", "NETFLIX", -1_990),
        charge("2026-04-03", "Netflix #12", -1_990),
      ],
      NOW,
    );
    expect(summary.subscriptions).toHaveLength(1);
    expect(summary.subscriptions[0]).toMatchObject({ merchant: "NETFLIX", occurrences: 3 });
  });

  it("rejects a merchant whose monthly amounts swing beyond the tolerance (variable spend)", () => {
    const summary = computeRecurringCharges(
      [
        charge("2026-02-03", "GROCERIES", -5_000),
        charge("2026-03-03", "GROCERIES", -12_000),
        charge("2026-04-03", "GROCERIES", -30_000),
      ],
      NOW,
    );
    expect(summary.subscriptions).toEqual([]);
  });

  it("ignores charges older than the window", () => {
    const summary = computeRecurringCharges(
      [
        // Sep 2025 is outside the 6-month window ending Apr 2026 (Nov 2025–Apr 2026).
        charge("2025-09-03", "OLDSUB", -990),
        charge("2026-03-03", "OLDSUB", -990),
        charge("2026-04-03", "OLDSUB", -990),
      ],
      NOW,
    );
    expect(summary.subscriptions).toEqual([]);
  });

  it("returns multiple subscriptions sorted by monthly amount with a committed total", () => {
    const months = ["2026-02-03", "2026-03-03", "2026-04-03"];
    const summary = computeRecurringCharges(
      [
        ...months.map((d) => charge(d, "SPOTIFY", -1_490)),
        ...months.map((d) => charge(d, "GYM", -8_900)),
      ],
      NOW,
    );
    expect(summary.subscriptions.map((s) => s.merchant)).toEqual(["GYM", "SPOTIFY"]);
    expect(summary.committedMonthlyTotal).toBe(10_390);
  });
});
