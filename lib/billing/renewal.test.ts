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

  it("does not mutate the input date", () => {
    const now = new Date("2026-03-15T00:00:00Z");
    nextRenewal(now, "monthly");
    expect(now.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });
});
