import { describe, expect, it } from "vitest";

import { detectTransferPairs } from "./detect-transfers";

describe("detectTransferPairs", () => {
  it("matches a debit to the equal-and-opposite credit in another account within the window", () => {
    const pairs = detectTransferPairs([
      { id: "out", accountId: "bank", amount: -50_000, date: "2026-03-10" },
      { id: "in", accountId: "card", amount: 50_000, date: "2026-03-11" },
    ]);
    expect(pairs).toEqual([{ fromId: "out", toId: "in" }]);
  });

  it("returns no pairs for no candidates", () => {
    expect(detectTransferPairs([])).toEqual([]);
  });

  it("does not match legs in the same account", () => {
    const pairs = detectTransferPairs([
      { id: "out", accountId: "bank", amount: -50_000, date: "2026-03-10" },
      { id: "in", accountId: "bank", amount: 50_000, date: "2026-03-10" },
    ]);
    expect(pairs).toEqual([]);
  });

  it("does not match when magnitudes differ", () => {
    const pairs = detectTransferPairs([
      { id: "out", accountId: "bank", amount: -50_000, date: "2026-03-10" },
      { id: "in", accountId: "card", amount: 49_000, date: "2026-03-10" },
    ]);
    expect(pairs).toEqual([]);
  });

  it("does not match when the legs are more than the window apart", () => {
    const pairs = detectTransferPairs([
      { id: "out", accountId: "bank", amount: -50_000, date: "2026-03-10" },
      { id: "in", accountId: "card", amount: 50_000, date: "2026-03-20" },
    ]);
    expect(pairs).toEqual([]);
  });

  it("uses each leg at most once (a debit does not claim an already-paired credit)", () => {
    const pairs = detectTransferPairs([
      { id: "out1", accountId: "bank", amount: -50_000, date: "2026-03-10" },
      { id: "out2", accountId: "bank", amount: -50_000, date: "2026-03-10" },
      { id: "in", accountId: "card", amount: 50_000, date: "2026-03-10" },
    ]);
    expect(pairs).toEqual([{ fromId: "out1", toId: "in" }]);
  });

  it("matches at exactly the window boundary but not one day beyond", () => {
    const atBoundary = detectTransferPairs([
      { id: "out", accountId: "bank", amount: -50_000, date: "2026-03-10" },
      { id: "in", accountId: "card", amount: 50_000, date: "2026-03-13" }, // 3 days
    ]);
    expect(atBoundary).toEqual([{ fromId: "out", toId: "in" }]);

    const justPast = detectTransferPairs([
      { id: "out", accountId: "bank", amount: -50_000, date: "2026-03-10" },
      { id: "in", accountId: "card", amount: 50_000, date: "2026-03-14" }, // 4 days
    ]);
    expect(justPast).toEqual([]);
  });

  it("matches regardless of leg order in the input", () => {
    const pairs = detectTransferPairs([
      { id: "in", accountId: "card", amount: 50_000, date: "2026-03-11" },
      { id: "out", accountId: "bank", amount: -50_000, date: "2026-03-10" },
    ]);
    expect(pairs).toEqual([{ fromId: "out", toId: "in" }]);
  });

  it("consumes each debit id once, so a duplicated debit can't claim two credits", () => {
    const pairs = detectTransferPairs([
      { id: "dupe", accountId: "bank", amount: -50_000, date: "2026-03-10" },
      { id: "dupe", accountId: "bank", amount: -50_000, date: "2026-03-10" },
      { id: "c1", accountId: "card", amount: 50_000, date: "2026-03-10" },
      { id: "c2", accountId: "card", amount: 50_000, date: "2026-03-10" },
    ]);
    expect(pairs).toEqual([{ fromId: "dupe", toId: "c1" }]);
  });
});
