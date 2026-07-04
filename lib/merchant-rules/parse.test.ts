import { describe, expect, it } from "vitest";

import { parseMerchantRuleInput } from "./parse";

describe("parseMerchantRuleInput", () => {
  it("accepts a flat rule and normalizes the merchant", () => {
    const result = parseMerchantRuleInput({ merchant: "  netflix  ", flatType: "Fixed" });
    expect(result).toEqual({ ok: true, value: { merchant: "NETFLIX", flatType: "Fixed" } });
  });

  it("accepts the empty (split/not-bucketed) flat type", () => {
    const result = parseMerchantRuleInput({ merchant: "AUR", flatType: "" });
    expect(result).toEqual({ ok: true, value: { merchant: "AUR", flatType: "" } });
  });

  it("accepts a split rule", () => {
    const result = parseMerchantRuleInput({
      merchant: "World Class",
      threshold: 5000,
      atOrAboveType: "Fixed",
      belowType: "Nice to have",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        merchant: "WORLD CLASS",
        threshold: 5000,
        atOrAboveType: "Fixed",
        belowType: "Nice to have",
      },
    });
  });

  it("rejects a merchant longer than the cap", () => {
    const result = parseMerchantRuleInput({ merchant: "a".repeat(201), flatType: "Fixed" });
    expect(result).toEqual({ ok: false, error: "merchant too long" });
  });

  it("rejects a body that mixes flat and split fields", () => {
    const result = parseMerchantRuleInput({ merchant: "X", flatType: "Fixed", threshold: 10 });
    expect(result.ok).toBe(false);
  });

  it("rejects a body with neither shape", () => {
    expect(parseMerchantRuleInput({ merchant: "X" }).ok).toBe(false);
  });

  it("rejects a missing or empty merchant", () => {
    expect(parseMerchantRuleInput({ flatType: "Fixed" }).ok).toBe(false);
    expect(parseMerchantRuleInput({ merchant: "   ", flatType: "Fixed" }).ok).toBe(false);
  });

  it("rejects invalid expense types", () => {
    expect(parseMerchantRuleInput({ merchant: "X", flatType: "Splurge" }).ok).toBe(false);
    expect(
      parseMerchantRuleInput({ merchant: "X", threshold: 10, atOrAboveType: "Nope", belowType: "Fixed" }).ok,
    ).toBe(false);
  });

  it("rejects a non-positive or non-integer threshold", () => {
    const base = { merchant: "X", atOrAboveType: "Fixed", belowType: "Necessary" };
    expect(parseMerchantRuleInput({ ...base, threshold: 0 }).ok).toBe(false);
    expect(parseMerchantRuleInput({ ...base, threshold: -5 }).ok).toBe(false);
    expect(parseMerchantRuleInput({ ...base, threshold: 1.5 }).ok).toBe(false);
  });

  it("rejects non-object bodies", () => {
    expect(parseMerchantRuleInput(null).ok).toBe(false);
    expect(parseMerchantRuleInput("nope").ok).toBe(false);
  });

  it("accepts an optional categoryId (ADR-0020) on flat and split rules", () => {
    const uuid = "11111111-2222-4333-8444-555555555555";
    const flat = parseMerchantRuleInput({ merchant: "BONUS", flatType: "Necessary", categoryId: uuid });
    expect(flat.ok && flat.value.categoryId).toBe(uuid);
    const split = parseMerchantRuleInput({
      merchant: "GYM",
      threshold: 5000,
      atOrAboveType: "Fixed",
      belowType: "Nice to have",
      categoryId: uuid,
    });
    expect(split.ok && split.value.categoryId).toBe(uuid);
  });

  it("leaves categoryId undefined when omitted, and rejects a non-uuid categoryId", () => {
    const none = parseMerchantRuleInput({ merchant: "X", flatType: "Fixed" });
    expect(none.ok && none.value.categoryId).toBeUndefined();
    expect(parseMerchantRuleInput({ merchant: "X", flatType: "Fixed", categoryId: "not-a-uuid" }).ok).toBe(false);
  });
});
