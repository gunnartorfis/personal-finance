import { beforeEach, describe, expect, it, vi } from "vitest";

const generateObject = vi.fn();
vi.mock("ai", () => ({ generateObject: (...a: unknown[]) => generateObject(...a) }));

import { aiColumnMappingSuggester } from "./ai-mapping";

const HEADER = ["Foo", "Bar", "Baz", "Qux"];
const SAMPLE = [["01.03.2026", "NETFLIX", "Afþreying", "-1.990 kr."]];

beforeEach(() => generateObject.mockReset());

describe("aiColumnMappingSuggester", () => {
  it("returns the model's in-range column indices as a mapping", async () => {
    generateObject.mockResolvedValue({ object: { date: 0, merchant: 1, category: 2, amount: 3 } });
    const suggest = aiColumnMappingSuggester();
    expect(await suggest(HEADER, SAMPLE)).toEqual({ date: 0, merchant: 1, category: 2, amount: 3 });
  });

  it("returns null when the model points at an out-of-range column", async () => {
    generateObject.mockResolvedValue({ object: { date: 0, merchant: 1, category: 2, amount: 9 } });
    expect(await aiColumnMappingSuggester()(HEADER, SAMPLE)).toBeNull();
  });

  it("returns null when the model reuses a column for two roles", async () => {
    generateObject.mockResolvedValue({ object: { date: 0, merchant: 0, category: 2, amount: 3 } });
    expect(await aiColumnMappingSuggester()(HEADER, SAMPLE)).toBeNull();
  });

  it("returns null when the model omits a role (incomplete suggestion)", async () => {
    generateObject.mockResolvedValue({ object: { date: 0, merchant: 1, category: 2 } });
    expect(await aiColumnMappingSuggester()(HEADER, SAMPLE)).toBeNull();
  });
});
