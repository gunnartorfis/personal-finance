import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the AI SDK so the unit test runs without a gateway call.
const generateObject = vi.fn();
vi.mock("ai", () => ({ generateObject: (...args: unknown[]) => generateObject(...args) }));

import { SONNET_MODEL, sonnetClassifier } from "./sonnet-classifier";

beforeEach(() => generateObject.mockReset());

describe("sonnetClassifier", () => {
  it("returns the model's structured classification", async () => {
    generateObject.mockResolvedValue({
      object: { expenseType: "Fixed", confidence: 0.96, reasoning: "named subscription" },
    });
    const classify = sonnetClassifier();
    const result = await classify({
      merchant: "NETFLIX",
      amount: -1990,
      rawCategory: "Afþreying",
      date: "2026-03-01",
    });
    expect(result).toEqual({ expenseType: "Fixed", confidence: 0.96, reasoning: "named subscription" });
  });

  it("calls Sonnet 4.6 via the gateway with the rules system prompt and the transaction details", async () => {
    generateObject.mockResolvedValue({ object: { expenseType: "", confidence: 0.9, reasoning: "split" } });
    await sonnetClassifier()({ merchant: "Aur", amount: -5000, rawCategory: "", date: "2026-03-02" });
    const args = generateObject.mock.calls[0][0];
    expect(args.model).toBe(SONNET_MODEL);
    expect(args.system).toMatch(/classify transactions/i);
    expect(args.prompt).toContain("Aur");
    expect(args.prompt).toContain("-5000");
  });
});
