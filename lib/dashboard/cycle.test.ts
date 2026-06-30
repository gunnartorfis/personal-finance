import { describe, expect, it } from "vitest";

import {
  cycleKeyLabel,
  cycleKeyRange,
  cycleLabel,
  cycleRange,
  currentCycleKey,
  isValidCycleKey,
  nextCycleKey,
  previousCycleKey,
} from "./cycle";

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

describe("currentCycleKey", () => {
  it("is the YYYY-MM of the month containing the date (UTC)", () => {
    expect(currentCycleKey(new Date("2026-03-15T12:00:00Z"))).toBe("2026-03");
    expect(currentCycleKey(new Date("2026-12-31T23:00:00Z"))).toBe("2026-12");
  });
});

describe("isValidCycleKey", () => {
  it("accepts a well-formed key and rejects malformed ones", () => {
    expect(isValidCycleKey("2026-03")).toBe(true);
    expect(isValidCycleKey("2026-12")).toBe(true);
    expect(isValidCycleKey("2026-13")).toBe(false);
    expect(isValidCycleKey("2026-00")).toBe(false);
    expect(isValidCycleKey("2026-3")).toBe(false);
    expect(isValidCycleKey("2026/03")).toBe(false);
    expect(isValidCycleKey("")).toBe(false);
  });
});

describe("cycleKeyRange", () => {
  it("returns the half-open range for a key, rolling the year in December", () => {
    expect(cycleKeyRange("2026-03")).toEqual({ from: "2026-03-01", to: "2026-04-01" });
    expect(cycleKeyRange("2026-12")).toEqual({ from: "2026-12-01", to: "2027-01-01" });
  });

  it("throws on a malformed key", () => {
    expect(() => cycleKeyRange("2026-13")).toThrow();
  });
});

describe("cycleKeyLabel", () => {
  it("formats a key as month and year", () => {
    expect(cycleKeyLabel("2026-03")).toBe("March 2026");
    expect(cycleKeyLabel("2025-01")).toBe("January 2025");
  });
});

describe("previousCycleKey / nextCycleKey", () => {
  it("steps within a year", () => {
    expect(previousCycleKey("2026-03")).toBe("2026-02");
    expect(nextCycleKey("2026-03")).toBe("2026-04");
  });

  it("rolls across year boundaries", () => {
    expect(previousCycleKey("2026-01")).toBe("2025-12");
    expect(nextCycleKey("2026-12")).toBe("2027-01");
  });
});
