import { describe, expect, it } from "vitest";

import {
  allowedNiceToHave,
  cardDebitsMagnitude,
  correctivePerCycle,
  cumulativeSaved,
  inferredSaving,
  isOnTrack,
  requiredCumulativeByCycle,
  type SavingsGoal,
} from "./savings.ts";

/** The running example from ADR-0007: 5M target, 1M already saved, 10 cycles left. */
const goal: SavingsGoal = { target: 5_000_000, startingSaved: 1_000_000, totalCycles: 10 };

describe("cardDebitsMagnitude", () => {
  it("is 0 for no transactions", () => {
    expect(cardDebitsMagnitude([])).toBe(0);
  });

  it("sums the magnitude of debits and ignores positive card lines (ADR-0007 debits-only)", () => {
    // two debits and one credit (e.g. a refund or a mistaken bank-account salary line)
    expect(cardDebitsMagnitude([-2979, -1323, 500_000])).toBe(4302);
  });

  it("ignores zero-amount rows", () => {
    expect(cardDebitsMagnitude([0, -100])).toBe(100);
  });
});

describe("inferredSaving", () => {
  it("is income minus off-card fixed minus card debits", () => {
    expect(inferredSaving({ monthlyIncome: 900_000, offCardFixed: 250_000, cardDebits: 520_000 })).toBe(
      130_000,
    );
  });

  it("is negative when spend exceeds income (a losing cycle)", () => {
    expect(inferredSaving({ monthlyIncome: 300_000, offCardFixed: 250_000, cardDebits: 100_000 })).toBe(
      -50_000,
    );
  });
});

describe("cumulativeSaved", () => {
  it("is the starting balance when there are no cycle snapshots", () => {
    expect(cumulativeSaved(1_000_000, [])).toBe(1_000_000);
  });

  it("adds the starting balance and every cycle's inferred saving (including losing cycles)", () => {
    expect(cumulativeSaved(1_000_000, [130_000, 200_000, -50_000])).toBe(1_280_000);
  });
});

describe("requiredCumulativeByCycle", () => {
  it("equals the starting balance before any cycle has elapsed", () => {
    expect(requiredCumulativeByCycle(goal, 0)).toBe(1_000_000);
  });

  it("equals the target once every cycle has elapsed", () => {
    expect(requiredCumulativeByCycle(goal, 10)).toBe(5_000_000);
  });

  it("interpolates linearly at the half-way point", () => {
    // 1,000,000 + (4,000,000 / 10) * 5
    expect(requiredCumulativeByCycle(goal, 5)).toBe(3_000_000);
  });

  it("clamps elapsed cycles into [0, totalCycles]", () => {
    expect(requiredCumulativeByCycle(goal, -1)).toBe(1_000_000);
    expect(requiredCumulativeByCycle(goal, 12)).toBe(5_000_000);
  });

  it("returns an exact, possibly fractional reference value (callers round for display)", () => {
    // 0 + (1,000,000 / 3) * 1 — an exact reference, deliberately not rounded
    expect(requiredCumulativeByCycle({ target: 1_000_000, startingSaved: 0, totalCycles: 3 }, 1)).toBeCloseTo(
      333_333.33,
      2,
    );
  });

  it("throws when the goal spans no cycles", () => {
    expect(() => requiredCumulativeByCycle({ ...goal, totalCycles: 0 }, 0)).toThrow(RangeError);
  });
});

describe("isOnTrack", () => {
  it("is true when cumulative saving meets the linear requirement exactly", () => {
    expect(isOnTrack(goal, 5, 3_000_000)).toBe(true);
  });

  it("is false when cumulative saving is a hair below the requirement", () => {
    expect(isOnTrack(goal, 5, 2_999_999)).toBe(false);
  });

  it("is true when ahead of the requirement", () => {
    expect(isOnTrack(goal, 5, 3_500_000)).toBe(true);
  });

  it("propagates the RangeError from a zero-cycle goal", () => {
    expect(() => isOnTrack({ ...goal, totalCycles: 0 }, 0, 0)).toThrow(RangeError);
  });
});

describe("correctivePerCycle", () => {
  it("splits the remaining amount evenly across the remaining cycles", () => {
    // on pace: (5,000,000 - 1,000,000) / 10
    expect(correctivePerCycle(goal, 1_000_000, 10)).toBe(400_000);
  });

  it("rises above the original pace when behind (fewer cycles, same shortfall)", () => {
    // behind: only 8 cycles left but still 4,000,000 to go
    expect(correctivePerCycle(goal, 1_000_000, 8)).toBe(500_000);
  });

  it("is the whole remaining amount when no cycles remain", () => {
    expect(correctivePerCycle(goal, 4_800_000, 0)).toBe(200_000);
  });

  it("is 0 once the target is met, even with no cycles left", () => {
    expect(correctivePerCycle(goal, 5_000_000, 0)).toBe(0);
    expect(correctivePerCycle(goal, 5_200_000, 0)).toBe(0);
  });

  it("never goes negative when already over-saved", () => {
    expect(correctivePerCycle(goal, 6_000_000, 5)).toBe(0);
  });

  it("rounds the required saving UP to whole units so following it never under-saves", () => {
    // remaining 4,000,001 over 3 cycles = 1,333,333.67 → ceil 1,333,334
    expect(correctivePerCycle({ target: 5_000_001, startingSaved: 1_000_000, totalCycles: 10 }, 1_000_000, 3)).toBe(
      1_333_334,
    );
  });
});

describe("allowedNiceToHave", () => {
  it("is what remains after required saving and expected essentials", () => {
    // 900,000 - 250,000 - 400,000 - 40,000 - 180,000
    expect(
      allowedNiceToHave({
        monthlyIncome: 900_000,
        offCardFixed: 250_000,
        requiredSaving: 400_000,
        expectedFixed: 40_000,
        expectedNecessary: 180_000,
      }),
    ).toBe(30_000);
  });

  it("is negative when the plan is over-committed (signals a required cut)", () => {
    expect(
      allowedNiceToHave({
        monthlyIncome: 900_000,
        offCardFixed: 250_000,
        requiredSaving: 500_000,
        expectedFixed: 40_000,
        expectedNecessary: 205_000,
      }),
    ).toBe(-95_000);
  });
});
