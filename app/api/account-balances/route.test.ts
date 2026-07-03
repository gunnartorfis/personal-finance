import { beforeEach, describe, expect, it, vi } from "vitest";

const requireHousehold = vi.fn();
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }));

import { POST } from "./route";

const postReq = (body: unknown) =>
  new Request("http://test/", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => requireHousehold.mockReset());

describe("POST /api/account-balances", () => {
  it("400s an empty or malformed body before resolving the household", async () => {
    expect((await POST(postReq({ balances: [] }))).status).toBe(400);
    expect((await POST(postReq({}))).status).toBe(400);
    expect(requireHousehold).not.toHaveBeenCalled();
  });

  it("400s a non-numeric balance entry before resolving the household", async () => {
    const res = await POST(postReq({ balances: [{ accountId: "a1", balance: "lots" }] }));
    expect(res.status).toBe(400);
    expect(requireHousehold).not.toHaveBeenCalled();
  });

  it("inserts a rounded snapshot per known account and returns 201", async () => {
    const insert = vi.fn().mockResolvedValue([]);
    requireHousehold.mockResolvedValue({
      repo: {
        accounts: {
          list: vi.fn().mockResolvedValue([{ id: "a1" }, { id: "a2" }]),
          balances: { insert },
        },
      },
    });

    const res = await POST(
      postReq({
        balances: [
          { accountId: "a1", balance: 120_000.6 }, // rounds to 120,001
          { accountId: "a2", balance: -5_000 }, // negatives allowed (card debt)
        ],
      }),
    );
    expect(res.status).toBe(201);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenCalledWith({ accountId: "a1", balance: 120_001 });
    expect(insert).toHaveBeenCalledWith({ accountId: "a2", balance: -5_000 });
  });

  it("400s and inserts nothing when any account id is not in the household", async () => {
    const insert = vi.fn().mockResolvedValue([]);
    requireHousehold.mockResolvedValue({
      repo: {
        accounts: {
          list: vi.fn().mockResolvedValue([{ id: "a1" }]),
          balances: { insert },
        },
      },
    });

    const res = await POST(
      postReq({ balances: [{ accountId: "a1", balance: 1 }, { accountId: "intruder", balance: 1 }] }),
    );
    expect(res.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });
});
