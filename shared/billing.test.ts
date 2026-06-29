import { describe, expect, it } from "vitest";

import { DEFAULT_CUTOFF_DAY, statementCycle } from "./billing.ts";

describe("statementCycle", () => {
  it("defaults to calendar-month bucketing (cutoff day 1)", () => {
    expect(DEFAULT_CUTOFF_DAY).toBe(1);
    expect(statementCycle("2026-03-01")).toBe("2026-03");
    expect(statementCycle("2026-03-15")).toBe("2026-03");
    expect(statementCycle("2026-03-31")).toBe("2026-03");
  });

  it("treats an explicit cutoff of 1 the same as the calendar-month default", () => {
    expect(statementCycle("2026-03-15", 1)).toBe(statementCycle("2026-03-15"));
  });

  describe("with a 27th cutoff (the legacy 27th–26th cycle)", () => {
    it("labels a cycle by its closing (later) month", () => {
      expect(statementCycle("2026-03-28", 27)).toBe("2026-04"); // Mar 27–Apr 26
      expect(statementCycle("2026-04-10", 27)).toBe("2026-04");
      expect(statementCycle("2026-04-26", 27)).toBe("2026-04");
    });

    it("rolls forward on the cutoff day itself", () => {
      expect(statementCycle("2026-04-27", 27)).toBe("2026-05");
    });

    it("rolls across a year boundary", () => {
      expect(statementCycle("2026-12-28", 27)).toBe("2027-01");
    });
  });
});
