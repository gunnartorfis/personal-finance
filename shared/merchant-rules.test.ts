import { describe, expect, it } from "vitest";

import { applyMerchantRules, normalizeMerchant, type MerchantRule } from "./merchant-rules.ts";

describe("normalizeMerchant", () => {
  it("uppercases, trims and collapses internal whitespace", () => {
    expect(normalizeMerchant("  netto   kringlan ")).toBe("NETTO KRINGLAN");
  });

  it("preserves Icelandic letters", () => {
    expect(normalizeMerchant("kaffitár")).toBe("KAFFITÁR");
  });

  it("strips a trailing store number", () => {
    expect(normalizeMerchant("BONUS 0123")).toBe("BONUS");
    expect(normalizeMerchant("N1 #45")).toBe("N1");
  });
});

describe("applyMerchantRules", () => {
  it("matches a flat rule and returns its type", () => {
    const rules: MerchantRule[] = [{ merchant: "NETFLIX", type: "Fixed" }];
    expect(applyMerchantRules(rules, { merchant: "Netflix", amount: -1990 })).toEqual({
      matched: true,
      type: "Fixed",
    });
  });

  it("matches despite a store number and location suffix (normalized + prefix)", () => {
    const rules: MerchantRule[] = [{ merchant: "BONUS", type: "Necessary" }];
    expect(applyMerchantRules(rules, { merchant: "BONUS KRINGLAN 045", amount: -3200 })).toEqual({
      matched: true,
      type: "Necessary",
    });
  });

  it("reports no match when no rule matches (row falls through to AI)", () => {
    const rules: MerchantRule[] = [{ merchant: "NETFLIX", type: "Fixed" }];
    expect(applyMerchantRules(rules, { merchant: "OBSCURE SHOP", amount: -500 })).toEqual({
      matched: false,
    });
  });

  it("distinguishes a matched empty type from no match", () => {
    // an Aur split payment maps to "" but is still an explicit match
    const rules: MerchantRule[] = [{ merchant: "AUR", type: "" }];
    expect(applyMerchantRules(rules, { merchant: "Aur", amount: -5000 })).toEqual({
      matched: true,
      type: "",
    });
  });

  it("does not match a different merchant that merely shares a prefix without a boundary", () => {
    const rules: MerchantRule[] = [{ merchant: "KAFFI", type: "Nice to have" }];
    expect(applyMerchantRules(rules, { merchant: "KAFFITÁR", amount: -650 })).toEqual({
      matched: false,
    });
  });

  it("applies an amount-threshold split rule by charge magnitude", () => {
    // World Class: >= 8000 ISK is a membership (Fixed); under is a drop-in (Nice to have).
    const rules: MerchantRule[] = [
      { merchant: "WORLD CLASS", threshold: 8000, atOrAbove: "Fixed", below: "Nice to have" },
    ];
    expect(applyMerchantRules(rules, { merchant: "World Class", amount: -9000 })).toEqual({
      matched: true,
      type: "Fixed",
    });
    expect(applyMerchantRules(rules, { merchant: "World Class", amount: -3000 })).toEqual({
      matched: true,
      type: "Nice to have",
    });
  });

  it("never buckets a credit, even when a rule matches the merchant", () => {
    const rules: MerchantRule[] = [
      { merchant: "NETFLIX", type: "Fixed" },
      { merchant: "WORLD CLASS", threshold: 8000, atOrAbove: "Fixed", below: "Nice to have" },
    ];
    // a +1990 Netflix refund and a +9000 World Class refund are credits, not expenses
    expect(applyMerchantRules(rules, { merchant: "Netflix", amount: 1990 })).toEqual({
      matched: false,
    });
    expect(applyMerchantRules(rules, { merchant: "World Class", amount: 9000 })).toEqual({
      matched: false,
    });
  });

  it("uses the first matching rule when several could match", () => {
    const rules: MerchantRule[] = [
      { merchant: "BONUS", type: "Necessary" },
      { merchant: "BONUS", type: "Fixed" },
    ];
    expect(applyMerchantRules(rules, { merchant: "BONUS", amount: -1000 })).toEqual({
      matched: true,
      type: "Necessary",
    });
  });
});
