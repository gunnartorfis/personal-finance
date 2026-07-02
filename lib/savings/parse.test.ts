import { describe, expect, it } from "vitest";

import { parseSavingsGoalInput } from "./parse";

const valid = {
  target: 3_000_000,
  targetDate: "2027-06-01",
  startingSaved: 250_000,
  startCycle: "2026-07",
};

describe("parseSavingsGoalInput", () => {
  it("accepts a valid goal and defaults the currency to ISK", () => {
    expect(parseSavingsGoalInput(valid)).toEqual({
      ok: true,
      value: { ...valid, currency: "ISK" },
    });
  });

  it("accepts an explicit uppercase ISO currency", () => {
    const result = parseSavingsGoalInput({ ...valid, currency: "EUR" });
    expect(result).toMatchObject({ ok: true, value: { currency: "EUR" } });
  });

  it("defaults startingSaved to 0 when omitted", () => {
    const { startingSaved: _omitted, ...rest } = valid;
    expect(parseSavingsGoalInput(rest)).toMatchObject({
      ok: true,
      value: { startingSaved: 0 },
    });
  });

  it("rejects a non-object body", () => {
    expect(parseSavingsGoalInput(null)).toMatchObject({ ok: false });
    expect(parseSavingsGoalInput("goal")).toMatchObject({ ok: false });
  });

  it("rejects a non-positive or non-integer target", () => {
    expect(parseSavingsGoalInput({ ...valid, target: 0 })).toMatchObject({ ok: false });
    expect(parseSavingsGoalInput({ ...valid, target: -5 })).toMatchObject({ ok: false });
    expect(parseSavingsGoalInput({ ...valid, target: 1.5 })).toMatchObject({ ok: false });
  });

  it("rejects a negative or non-integer startingSaved", () => {
    expect(parseSavingsGoalInput({ ...valid, startingSaved: -1 })).toMatchObject({ ok: false });
    expect(parseSavingsGoalInput({ ...valid, startingSaved: 0.5 })).toMatchObject({ ok: false });
  });

  it("rejects a malformed targetDate", () => {
    expect(parseSavingsGoalInput({ ...valid, targetDate: "June 2027" })).toMatchObject({
      ok: false,
    });
    expect(parseSavingsGoalInput({ ...valid, targetDate: "2027-13-01" })).toMatchObject({
      ok: false,
    });
  });

  it("rejects a malformed startCycle key", () => {
    expect(parseSavingsGoalInput({ ...valid, startCycle: "2026-13" })).toMatchObject({ ok: false });
    expect(parseSavingsGoalInput({ ...valid, startCycle: "26-07" })).toMatchObject({ ok: false });
  });

  it("rejects a targetDate on or before the start cycle's first day (mirrors the DB check)", () => {
    expect(parseSavingsGoalInput({ ...valid, targetDate: "2026-07-01" })).toMatchObject({
      ok: false,
    });
    expect(parseSavingsGoalInput({ ...valid, targetDate: "2026-06-15" })).toMatchObject({
      ok: false,
    });
  });

  it("rejects a non three-letter-uppercase currency", () => {
    expect(parseSavingsGoalInput({ ...valid, currency: "isk" })).toMatchObject({ ok: false });
    expect(parseSavingsGoalInput({ ...valid, currency: "KRÓNUR" })).toMatchObject({ ok: false });
  });
});
