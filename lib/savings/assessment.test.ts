import { describe, expect, it, vi } from "vitest";

import type { HouseholdRepo } from "@/lib/db/household-repo";

// loadExpectedSpend has its own tests and needs a fuller repo; stub it so this file exercises the
// derivation + assessment math in isolation.
vi.mock("@/lib/savings/expected-spend", () => ({
  loadExpectedSpend: vi.fn().mockResolvedValue({
    expectedFixed: 120_000,
    expectedNecessary: 80_000,
    cyclesUsed: 0,
    source: "manual" as const,
  }),
}));

import { loadSavingsProgress, loadSavingsSnapshot } from "./assessment";

type Goal = { target: number; targetDate: string; startingSaved: number; startCycle: string; currency: string };

/** Minimal repo double: only the methods the derivation touches. */
function fakeRepo(opts: {
  goal?: Goal;
  income?: Array<{ amount: number }>;
  offcard?: Array<{ monthlyAmount: number }>;
  series?: Array<{ month: string; spending: number; income: number }>;
}): HouseholdRepo {
  return {
    savings: {
      goal: { get: async () => opts.goal },
      incomeSources: { list: async () => opts.income ?? [] },
      offcardCosts: { list: async () => opts.offcard ?? [] },
    },
    transactions: { monthlySpendSeries: async () => opts.series ?? [] },
  } as unknown as HouseholdRepo;
}

const GOAL: Goal = {
  target: 3_000_000,
  targetDate: "2027-06-01",
  startingSaved: 100_000,
  startCycle: "2026-06",
  currency: "ISK",
};

// 2026-06 through 2026-08 inclusive (three elapsed cycles).
const NOW = new Date("2026-08-15T00:00:00Z");

describe("loadSavingsProgress", () => {
  it("is null without a goal", async () => {
    expect(await loadSavingsProgress(fakeRepo({}), NOW)).toBeNull();
  });

  it("derives saved from config income/costs minus each cycle's card debits", async () => {
    const progress = await loadSavingsProgress(
      fakeRepo({
        goal: GOAL,
        income: [{ amount: 600_000 }, { amount: 400_000 }], // 1,000,000
        offcard: [{ monthlyAmount: 200_000 }],
        series: [
          { month: "2026-06", spending: 500_000, income: 0 },
          { month: "2026-07", spending: 300_000, income: 0 },
          // 2026-08 absent → 0 debits (in-progress cycle)
        ],
      }),
      NOW,
    );
    // Completed cycles only (ADR-0014): 2026-06 → 300k, 2026-07 → 500k = 800,000; +100k starting.
    // The in-progress 2026-08 cycle (800k) is excluded from saved.
    expect(progress).toMatchObject({ saved: 900_000, target: 3_000_000, currency: "ISK" });
  });
});

describe("loadSavingsSnapshot", () => {
  it("returns a provisional assessment plus a per-cycle breakdown", async () => {
    const snapshot = await loadSavingsSnapshot(
      fakeRepo({
        goal: GOAL,
        income: [{ amount: 1_000_000 }],
        offcard: [{ monthlyAmount: 200_000 }],
        series: [{ month: "2026-06", spending: 500_000, income: 0 }],
      }),
      NOW,
    );
    expect(snapshot).not.toBeNull();
    // Completed cycles only: 2026-06 and 2026-07 (2026-08 is in progress) → 2 (ADR-0014).
    expect(snapshot!.assessment.cyclesElapsed).toBe(2);
    // The current (last) cycle is still in progress.
    expect(snapshot!.assessment.provisional).toBe(true);
    // Breakdown still covers 2026-06..2026-08 oldest-first; only the last is flagged in-progress.
    expect(snapshot!.cycles.map((c) => c.cycleKey)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(snapshot!.cycles.map((c) => c.inProgress)).toEqual([false, false, true]);
    // Expected spend comes from the stubbed estimator.
    expect(snapshot!.assessment.expectedFixed).toBe(120_000);
  });

  it("is null without a goal", async () => {
    expect(await loadSavingsSnapshot(fakeRepo({}), NOW)).toBeNull();
  });

  // Regression (ADR-0014): on the 1st of a month the current cycle carries full Monthly income
  // against ~zero spend, which previously inflated saved to startingSaved + the whole income.
  it("excludes the current in-progress cycle's income from saved until its month closes", async () => {
    const july1 = new Date("2026-07-01T00:00:00Z");
    const progress = await loadSavingsProgress(
      fakeRepo({
        goal: { ...GOAL, startCycle: "2026-07" }, // the only cycle is the in-progress one
        income: [{ amount: 1_000_000 }],
        series: [], // no spend logged yet this month
      }),
      july1,
    );
    // Current month not counted → only the starting balance, NOT startingSaved + 1,000,000.
    expect(progress!.saved).toBe(GOAL.startingSaved);
  });

  it("handles a goal whose start cycle is still in the future", async () => {
    const snapshot = await loadSavingsSnapshot(
      fakeRepo({
        goal: { ...GOAL, startCycle: "2026-09" }, // after NOW (2026-08)
        income: [{ amount: 1_000_000 }],
        offcard: [{ monthlyAmount: 200_000 }],
      }),
      NOW,
    );
    expect(snapshot).not.toBeNull();
    expect(snapshot!.cycles).toEqual([]); // inverted range → no elapsed cycles
    expect(snapshot!.assessment.cyclesElapsed).toBe(0);
    expect(snapshot!.assessment.provisional).toBe(false);
    expect(snapshot!.progress.saved).toBe(GOAL.startingSaved); // only the starting balance
  });
});
