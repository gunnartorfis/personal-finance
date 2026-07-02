import { describe, expect, it } from "vitest";

import { buildReuseSeed, type ReuseTally } from "./reuse";

const tally = (
  merchant: string,
  expenseType: ReuseTally["expenseType"],
  n: number,
  maxConfidence: number | null = 0.9,
): ReuseTally => ({ merchant, expenseType, n, maxConfidence });

describe("buildReuseSeed", () => {
  it("seeds a merchant from a single confident classification", () => {
    const seed = buildReuseSeed([tally("NETFLIX", "Fixed", 1, 0.98)]);
    expect(seed.get("NETFLIX")).toEqual({ type: "Fixed", confidence: 0.98 });
  });

  it("normalizes merchants so store-number variants share one entry", () => {
    const seed = buildReuseSeed([tally("BONUS", "Necessary", 3), tally("BONUS 045", "Necessary", 2)]);
    expect(seed.size).toBe(1);
    expect(seed.get("BONUS")).toEqual({ type: "Necessary", confidence: 0.9 });
  });

  it("picks the majority type when a merchant's history disagrees", () => {
    const seed = buildReuseSeed([
      tally("WORLD CLASS", "Fixed", 2, 0.9),
      tally("WORLD CLASS", "Nice to have", 1, 0.8),
    ]);
    expect(seed.get("WORLD CLASS")).toEqual({ type: "Fixed", confidence: 0.9 });
  });

  it("skips a merchant whose top count is tied (the model decides)", () => {
    const seed = buildReuseSeed([
      tally("WORLD CLASS", "Fixed", 1),
      tally("WORLD CLASS", "Nice to have", 1),
    ]);
    expect(seed.has("WORLD CLASS")).toBe(false);
  });

  it("uses the top confidence of the winning type", () => {
    const seed = buildReuseSeed([
      tally("BONUS", "Necessary", 1, 0.75),
      tally("BONUS 1", "Necessary", 1, 0.92),
    ]);
    expect(seed.get("BONUS")?.confidence).toBe(0.92);
  });
});
