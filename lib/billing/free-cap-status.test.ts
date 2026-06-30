import { describe, expect, it } from "vitest";

import { freeCapStatus } from "./free-cap-status";

describe("freeCapStatus", () => {
  it("reports remaining runway for a Free household below the cap", () => {
    expect(freeCapStatus({ plan: "Free", classifiedCount: 12 })).toEqual({
      plan: "Free",
      unlimited: false,
      cap: 50,
      used: 12,
      remaining: 38,
      paused: false,
    });
  });

  it("reports paused for a Free household at the cap", () => {
    const status = freeCapStatus({ plan: "Free", classifiedCount: 50 });
    expect(status.paused).toBe(true);
    expect(status.remaining).toBe(0);
    expect(status.used).toBe(50);
  });

  it("clamps used to the cap and stays paused past the cap", () => {
    const status = freeCapStatus({ plan: "Free", classifiedCount: 73 });
    expect(status.used).toBe(50);
    expect(status.paused).toBe(true);
  });

  it("treats an invalid count as zero used (fail-safe)", () => {
    expect(freeCapStatus({ plan: "Free", classifiedCount: -5 }).used).toBe(0);
    expect(freeCapStatus({ plan: "Free", classifiedCount: Number.NaN }).remaining).toBe(0);
  });

  it("is unlimited and never paused for Premium", () => {
    const status = freeCapStatus({ plan: "Premium", classifiedCount: 999 });
    expect(status.unlimited).toBe(true);
    expect(status.paused).toBe(false);
    expect(status.remaining).toBe(Infinity);
    expect(status.used).toBe(999);
  });
});
