import { describe, expect, it } from "vitest";

import { cycleLabel, cycleRange } from "./cycle";

describe("cycleRange", () => {
  it("returns the half-open range of the calendar month containing the date", () => {
    expect(cycleRange(new Date("2026-03-15T12:00:00Z"))).toEqual({
      from: "2026-03-01",
      to: "2026-04-01",
    });
  });

  it("rolls over the year in December", () => {
    expect(cycleRange(new Date("2026-12-20T00:00:00Z"))).toEqual({
      from: "2026-12-01",
      to: "2027-01-01",
    });
  });

  it("includes the first instant of the month and excludes the next month", () => {
    expect(cycleRange(new Date("2026-07-01T00:00:00Z"))).toEqual({
      from: "2026-07-01",
      to: "2026-08-01",
    });
  });
});

describe("cycleLabel", () => {
  it("formats the month and year", () => {
    expect(cycleLabel(new Date("2026-03-15T12:00:00Z"))).toBe("March 2026");
  });
});
