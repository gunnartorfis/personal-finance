import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the AI SDK so the unit test runs without a gateway call.
const generateObject = vi.fn();
vi.mock("ai", () => ({ generateObject: (...args: unknown[]) => generateObject(...args) }));

import { SONNET_MODEL, sonnetClassifier } from "./sonnet-classifier";

beforeEach(() => generateObject.mockReset());

describe("sonnetClassifier", () => {
  it("returns the model's structured classification", async () => {
    generateObject.mockResolvedValue({
      object: {
        expenseType: "Fixed",
        confidence: 0.96,
        reasoning: "named subscription",
        category: "subscriptions",
        categoryConfidence: 0.94,
      },
    });
    const classify = sonnetClassifier();
    const result = await classify({
      merchant: "NETFLIX",
      amount: -1990,
      rawCategory: "Afþreying",
      date: "2026-03-01",
    });
    expect(result).toEqual({
      expenseType: "Fixed",
      confidence: 0.96,
      reasoning: "named subscription",
      category: "subscriptions",
      categoryConfidence: 0.94,
    });
  });

  it("calls Sonnet 5 via the gateway with the rules system prompt and the transaction details", async () => {
    generateObject.mockResolvedValue({
      object: { expenseType: "", confidence: 0.9, reasoning: "split", category: "", categoryConfidence: 0 },
    });
    await sonnetClassifier()({ merchant: "Aur", amount: -5000, rawCategory: "", date: "2026-03-02" });
    const args = generateObject.mock.calls[0][0];
    expect(args.model).toBe(SONNET_MODEL);
    expect(args.system).toMatch(/classify transactions/i);
    expect(args.prompt).toContain("Aur");
    expect(args.prompt).toContain("-5000");
  });

  it("also emits an independent category + categoryConfidence, and lists the catalog in the prompt", async () => {
    generateObject.mockResolvedValue({
      object: {
        expenseType: "Necessary",
        confidence: 0.9,
        reasoning: "supermarket",
        category: "groceries",
        categoryConfidence: 0.88,
      },
    });
    const result = await sonnetClassifier()({
      merchant: "BONUS",
      amount: -4200,
      rawCategory: "Matvörur",
      date: "2026-03-03",
    });
    expect(result.category).toBe("groceries");
    expect(result.categoryConfidence).toBeCloseTo(0.88);
    // Expense type output is unchanged.
    expect(result.expenseType).toBe("Necessary");
    // The prompt lists the seed category catalog (a known leaf slug) and asks for a category.
    const { prompt } = generateObject.mock.calls[0][0];
    expect(prompt).toContain("groceries");
    expect(prompt.toLowerCase()).toContain("category");
  });

  it("delimits the untrusted merchant/category as data and clamps them to 200 chars", async () => {
    generateObject.mockResolvedValue({
      object: { expenseType: "", confidence: 0.5, reasoning: "x", category: "", categoryConfidence: 0 },
    });
    const bigMerchant = "M".repeat(500);
    await sonnetClassifier()({ merchant: bigMerchant, amount: -100, rawCategory: "C".repeat(500), date: "2026-03-02" });
    const { prompt, system } = generateObject.mock.calls[0][0];
    // Untrusted fields wrapped so the model reads them as data, not instructions.
    expect(prompt).toContain(`<data>${"M".repeat(200)}</data>`);
    expect(prompt).toContain(`<data>${"C".repeat(200)}</data>`);
    // The full 500-char cell never reaches the model.
    expect(prompt).not.toContain("M".repeat(201));
    // The data-framing instruction lives in the system turn (higher authority than the user turn that
    // carries the injectable value) — prompt-injection hardening.
    expect(system).toContain("<data>");
    expect(system).toContain("never instructions");
  });
});
