import { beforeEach, describe, expect, it, vi } from "vitest";

const requireHousehold = vi.fn();
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }));

import { GET, PUT } from "./route";

const putReq = (body: unknown) =>
  new Request("http://test/", { method: "PUT", body: JSON.stringify(body) });

const sources = [{ id: "s1", name: "Salary", amount: 700_000 }];
const costs = [{ id: "c1", name: "Mortgage", monthlyAmount: 250_000 }];

beforeEach(() => requireHousehold.mockReset());

describe("GET /api/savings/config", () => {
  it("returns the household's income sources and off-card costs", async () => {
    requireHousehold.mockResolvedValue({
      repo: {
        savings: {
          incomeSources: { list: vi.fn().mockResolvedValue(sources) },
          offcardCosts: { list: vi.fn().mockResolvedValue(costs) },
        },
      },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ incomeSources: sources, offcardCosts: costs });
  });
});

describe("PUT /api/savings/config", () => {
  it("400s an invalid body before resolving the household", async () => {
    const res = await PUT(putReq({ incomeSources: [{ name: "", amount: 1 }], offcardCosts: [] }));
    expect(res.status).toBe(400);
    expect(requireHousehold).not.toHaveBeenCalled();
  });

  it("replaces both lists in one atomic call and returns the saved config", async () => {
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
    expect(replaceConfig).toHaveBeenCalledWith(
      [{ name: "Salary", amount: 700_000 }],
      [{ name: "Mortgage", monthlyAmount: 250_000 }],
    );
    expect(await res.json()).toEqual({ incomeSources: sources, offcardCosts: costs });
  });
});
