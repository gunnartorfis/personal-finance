import { describe, expect, it } from "vitest";

import { nextRenewal } from "./renewal";

describe("nextRenewal", () => {
  it("adds one month for monthly", () => {
    expect(nextRenewal(new Date("2026-03-15T00:00:00Z"), "monthly").toISOString()).toBe(
      "2026-04-15T00:00:00.000Z",
    );
  });

  it("adds one year for annual", () => {
    expect(nextRenewal(new Date("2026-03-15T00:00:00Z"), "annual").toISOString()).toBe(
      "2027-03-15T00:00:00.000Z",
    );
  });

  it("clamps month-end overflow instead of skipping a month", () => {
    // Jan 31 + 1 month -> Feb 28 (2026 is not a leap year), not Mar 3.
    expect(nextRenewal(new Date("2026-01-31T00:00:00Z"), "monthly").toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
    // Leap year: Jan 31 -> Feb 29.
    expect(nextRenewal(new Date("2024-01-31T00:00:00Z"), "monthly").toISOString()).toBe(
      "2024-02-29T00:00:00.000Z",
    );
  });

  it("clamps a leap-day annual renewal to Feb 28", () => {
    expect(nextRenewal(new Date("2024-02-29T00:00:00Z"), "annual").toISOString()).toBe(
      "2025-02-28T00:00:00.000Z",
    );
  });

  it("does not mutate the input date", () => {
    const now = new Date("2026-03-15T00:00:00Z");
    nextRenewal(now, "monthly");
    expect(now.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });
});
