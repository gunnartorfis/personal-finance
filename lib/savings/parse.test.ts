import { describe, expect, it } from "vitest";

import { parseSavingsConfigInput, parseSavingsGoalInput } from "./parse";

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
    const rest = { target: valid.target, targetDate: valid.targetDate, startCycle: valid.startCycle };
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

  it("rejects an impossible calendar date", () => {
    expect(parseSavingsGoalInput({ ...valid, targetDate: "2027-02-31" })).toMatchObject({
      ok: false,
    });
    expect(parseSavingsGoalInput({ ...valid, targetDate: "2027-04-31" })).toMatchObject({
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

describe("parseSavingsConfigInput", () => {
  const validConfig = {
    incomeSources: [
      { name: "Salary A", amount: 700_000 },
      { name: "Salary B", amount: 550_000 },
    ],
    offcardCosts: [{ name: "Mortgage", monthlyAmount: 250_000 }],
  };

  it("accepts valid income sources and off-card costs, trimming names, defaulting the effective cycle", () => {
    expect(
      parseSavingsConfigInput({
        incomeSources: [{ name: "  Salary A ", amount: 700_000 }],
        offcardCosts: [{ name: " Mortgage ", monthlyAmount: 250_000 }],
      }),
    ).toEqual({
      ok: true,
      value: {
        // effectiveFrom defaults to the floor sentinel (ADR-0015) — the pre-dated baseline.
        incomeSources: [{ name: "Salary A", amount: 700_000, effectiveFrom: "0001-01" }],
        offcardCosts: [{ name: "Mortgage", monthlyAmount: 250_000, effectiveFrom: "0001-01" }],
      },
    });
  });

  it("accepts an explicit effective cycle on income and off-card entries (ADR-0015)", () => {
    const result = parseSavingsConfigInput({
      incomeSources: [{ name: "Salary", amount: 600_000, effectiveFrom: "2026-07" }],
      offcardCosts: [{ name: "Rent", monthlyAmount: 320_000, effectiveFrom: "2026-07" }],
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        incomeSources: [{ effectiveFrom: "2026-07" }],
        offcardCosts: [{ effectiveFrom: "2026-07" }],
      },
    });
  });

  it("rejects a malformed effective cycle", () => {
    expect(
      parseSavingsConfigInput({
        incomeSources: [{ name: "Salary", amount: 1, effectiveFrom: "2026-13" }],
        offcardCosts: [],
      }),
    ).toMatchObject({ ok: false });
  });

  it("accepts empty lists (clearing the config)", () => {
    expect(parseSavingsConfigInput({ incomeSources: [], offcardCosts: [] })).toEqual({
      ok: true,
      value: { incomeSources: [], offcardCosts: [] },
    });
  });

  it("parses one-off adjustments (income + cost, optional label)", () => {
    const result = parseSavingsConfigInput({
      incomeSources: [],
      offcardCosts: [],
      oneOffAdjustments: [
        { cycleKey: "2026-03", kind: "income", amount: 300_000, label: "  Tax refund " },
        { cycleKey: "2026-04", kind: "cost", amount: 90_000 },
      ],
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        oneOffAdjustments: [
          { cycleKey: "2026-03", kind: "income", amount: 300_000, label: "Tax refund" },
          { cycleKey: "2026-04", kind: "cost", amount: 90_000 },
        ],
      },
    });
  });

  it("treats a null one-off label as absent, so a GET→PUT round-trip of DB rows doesn't 400", () => {
    const result = parseSavingsConfigInput({
      incomeSources: [],
      offcardCosts: [],
      oneOffAdjustments: [{ cycleKey: "2026-03", kind: "income", amount: 5, label: null }],
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.oneOffAdjustments![0].label).toBeUndefined();
  });

  it("leaves oneOffAdjustments undefined when the body omits it (don't-touch semantics)", () => {
    const result = parseSavingsConfigInput({ incomeSources: [], offcardCosts: [] });
    expect(result.ok && result.value.oneOffAdjustments).toBeUndefined();
  });

  it("rejects one-off adjustments that aren't an array, or with a bad kind / cycle / amount", () => {
    expect(
      parseSavingsConfigInput({ incomeSources: [], offcardCosts: [], oneOffAdjustments: {} }),
    ).toMatchObject({ ok: false });
    for (const bad of [
      { cycleKey: "2026-13", kind: "income", amount: 1 },
      { cycleKey: "2026-03", kind: "bogus", amount: 1 },
      { cycleKey: "2026-03", kind: "income", amount: -1 },
    ]) {
      expect(
        parseSavingsConfigInput({ incomeSources: [], offcardCosts: [], oneOffAdjustments: [bad] }),
      ).toMatchObject({ ok: false });
    }
  });

  it("rejects a non-object body or missing lists", () => {
    expect(parseSavingsConfigInput(null)).toMatchObject({ ok: false });
    expect(parseSavingsConfigInput({ incomeSources: [] })).toMatchObject({ ok: false });
    expect(parseSavingsConfigInput({ offcardCosts: [] })).toMatchObject({ ok: false });
  });

  it("rejects an empty or missing name", () => {
    expect(
      parseSavingsConfigInput({
        ...validConfig,
        incomeSources: [{ name: "   ", amount: 1 }],
      }),
    ).toMatchObject({ ok: false });
    expect(
      parseSavingsConfigInput({
        ...validConfig,
        offcardCosts: [{ monthlyAmount: 1 }],
      }),
    ).toMatchObject({ ok: false });
  });

  it("rejects negative or non-integer amounts", () => {
    expect(
      parseSavingsConfigInput({
        ...validConfig,
        incomeSources: [{ name: "Salary", amount: -1 }],
      }),
    ).toMatchObject({ ok: false });
    expect(
      parseSavingsConfigInput({
        ...validConfig,
        offcardCosts: [{ name: "Rent", monthlyAmount: 10.5 }],
      }),
    ).toMatchObject({ ok: false });
  });
});
