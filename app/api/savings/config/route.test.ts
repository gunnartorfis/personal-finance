import { beforeEach, describe, expect, it, vi } from "vitest";

const requireHousehold = vi.fn();
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }));

import { GET, PUT } from "./route";

const putReq = (body: unknown) =>
  new Request("http://test/", { method: "PUT", body: JSON.stringify(body) });

const sources = [{ id: "s1", name: "Salary", amount: 700_000, effectiveFrom: "0001-01" }];
const costs = [{ id: "c1", name: "Mortgage", monthlyAmount: 250_000, effectiveFrom: "0001-01" }];
const oneOffs = [{ id: "o1", cycleKey: "2026-03", kind: "income", amount: 300_000, label: null }];

beforeEach(() => requireHousehold.mockReset());

describe("GET /api/savings/config", () => {
  it("returns the household's income sources, off-card costs, and one-off adjustments", async () => {
    requireHousehold.mockResolvedValue({
      repo: {
        savings: {
          incomeSources: { list: vi.fn().mockResolvedValue(sources) },
          offcardCosts: { list: vi.fn().mockResolvedValue(costs) },
          oneOffAdjustments: { list: vi.fn().mockResolvedValue(oneOffs) },
        },
      },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      incomeSources: sources,
      offcardCosts: costs,
      oneOffAdjustments: oneOffs,
    });
  });
});

describe("PUT /api/savings/config", () => {
  it("400s an invalid body before resolving the household", async () => {
    const res = await PUT(putReq({ incomeSources: [{ name: "", amount: 1 }], offcardCosts: [] }));
    expect(res.status).toBe(400);
    expect(requireHousehold).not.toHaveBeenCalled();
  });

  it("replaces the lists in one atomic call, defaulting the effective cycle, and returns the saved config", async () => {
    const replaceConfig = vi
      .fn()
      .mockResolvedValue({ incomeSources: sources, offcardCosts: costs });
    requireHousehold.mockResolvedValue({ repo: { savings: { replaceConfig } } });

    const res = await PUT(
      putReq({
        incomeSources: [{ name: "Salary", amount: 700_000 }],
        offcardCosts: [{ name: "Mortgage", monthlyAmount: 250_000 }],
      }),
    );
    expect(res.status).toBe(200);
    // effectiveFrom defaults to the floor; no one-off list in the body → undefined (leave untouched).
    expect(replaceConfig).toHaveBeenCalledWith(
      [{ name: "Salary", amount: 700_000, effectiveFrom: "0001-01" }],
      [{ name: "Mortgage", monthlyAmount: 250_000, effectiveFrom: "0001-01" }],
      undefined,
    );
    expect(await res.json()).toEqual({ incomeSources: sources, offcardCosts: costs });
  });

  it("passes dated versions and one-off adjustments through to replaceConfig", async () => {
    const replaceConfig = vi.fn().mockResolvedValue({});
    requireHousehold.mockResolvedValue({ repo: { savings: { replaceConfig } } });

    const res = await PUT(
      putReq({
        incomeSources: [{ name: "Salary", amount: 600_000, effectiveFrom: "2026-07" }],
        offcardCosts: [],
        oneOffAdjustments: [{ cycleKey: "2026-03", kind: "income", amount: 300_000, label: "Refund" }],
      }),
    );
    expect(res.status).toBe(200);
    expect(replaceConfig).toHaveBeenCalledWith(
      [{ name: "Salary", amount: 600_000, effectiveFrom: "2026-07" }],
      [],
      [{ cycleKey: "2026-03", kind: "income", amount: 300_000, label: "Refund" }],
    );
  });
});
