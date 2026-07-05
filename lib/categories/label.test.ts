import { describe, expect, it } from "vitest";

import { resolveCategoryLabel } from "./label";

describe("resolveCategoryLabel (ADR-0020)", () => {
  const translate = (key: string) => `t:${key}`;

  it("translates a seed row via its labelKey", () => {
    expect(resolveCategoryLabel({ labelKey: "groceries", label: null }, translate)).toBe("t:groceries");
  });

  it("uses the literal label for a custom row (not translated)", () => {
    expect(resolveCategoryLabel({ labelKey: null, label: "Sundlaug" }, translate)).toBe("Sundlaug");
  });

  it("prefers the labelKey when both are somehow present", () => {
    expect(resolveCategoryLabel({ labelKey: "fuel", label: "ignored" }, translate)).toBe("t:fuel");
  });

  it("falls back to empty string when neither is set", () => {
    expect(resolveCategoryLabel({ labelKey: null, label: null }, translate)).toBe("");
  });

  it("routes a non-null (even empty) labelKey through translate, not the literal-label path", () => {
    // labelKey/label are mutually exclusive; a present labelKey means seed row, so we never fall
    // through to `label` on a non-null labelKey.
    expect(resolveCategoryLabel({ labelKey: "", label: "should-not-win" }, translate)).toBe("t:");
  });
});
