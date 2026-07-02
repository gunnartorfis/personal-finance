import { describe, expect, it } from "vitest";

import { buildSavingsProgress } from "./progress";

const goal = {
  target: 1_200_000,
  startingSaved: 100_000,
  startCycle: "2026-06",
  currency: "ISK",
};

const checkin = (cycleKey: string, inferredSaving: number) => ({ cycleKey, inferredSaving });

describe("buildSavingsProgress", () => {
  it("is null without a goal", () => {
    expect(buildSavingsProgress(undefined, [])).toBeNull();
  });

  it("sums starting saved plus check-ins from the start cycle on", () => {
    expect(
      buildSavingsProgress(goal, [
        checkin("2026-05", 999_999), // before the start cycle — an earlier goal's history
        checkin("2026-06", 250_000),
        checkin("2026-07", 150_000),
      ]),
    ).toEqual({
      target: 1_200_000,
      saved: 500_000, // 100k starting + 250k + 150k
      percent: 42, // round(500k / 1.2M * 100)
      currency: "ISK",
    });
  });

  it("clamps percent to 0-100 (overshoot and losing cycles)", () => {
    expect(buildSavingsProgress(goal, [checkin("2026-06", 2_000_000)])?.percent).toBe(100);
    expect(buildSavingsProgress(goal, [checkin("2026-06", -400_000)])).toMatchObject({
      saved: -300_000,
      percent: 0,
    });
  });
});
