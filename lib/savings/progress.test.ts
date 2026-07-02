import { describe, expect, it } from "vitest";

import { buildSavingsProgress } from "./progress";

const goal = {
  target: 1_200_000,
  startingSaved: 100_000,
  currency: "ISK",
};

describe("buildSavingsProgress", () => {
  it("is null without a goal", () => {
    expect(buildSavingsProgress(undefined, [])).toBeNull();
  });

  it("sums starting saved plus each cycle's inferred saving", () => {
    expect(buildSavingsProgress(goal, [250_000, 150_000])).toEqual({
      target: 1_200_000,
      saved: 500_000, // 100k starting + 250k + 150k
      percent: 42, // round(500k / 1.2M * 100)
      currency: "ISK",
    });
  });

  it("clamps percent to 0-100 (overshoot and losing cycles)", () => {
    expect(buildSavingsProgress(goal, [2_000_000])?.percent).toBe(100);
    expect(buildSavingsProgress(goal, [-400_000])).toMatchObject({
      saved: -300_000,
      percent: 0,
    });
  });
});
