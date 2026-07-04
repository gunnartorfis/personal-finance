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

  it("inserts rounded snapshots for known accounts atomically and returns 201", async () => {
    const insertMany = vi.fn().mockResolvedValue([]);
    const record = vi.fn().mockResolvedValue([]);
    requireHousehold.mockResolvedValue({
      repo: {
        accounts: {
          list: vi.fn().mockResolvedValue([{ id: "a1" }, { id: "a2" }]),
          balances: { insertMany },
        },
        activity: { record },
      },
      memberId: "m1",
      user: { name: "Ada", email: "a@x.is" },
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
    // One atomic multi-row insert, not a row-at-a-time loop.
    expect(insertMany).toHaveBeenCalledTimes(1);
    expect(insertMany).toHaveBeenCalledWith([
      { accountId: "a1", balance: 120_001 },
      { accountId: "a2", balance: -5_000 },
    ]);
    expect(record).toHaveBeenCalledWith({
      memberId: "m1",
      actorName: "Ada",
      action: "account.balance_recorded",
      payload: {
        count: 2,
        balances: [
          { accountId: "a1", balance: 120_001 },
          { accountId: "a2", balance: -5_000 },
        ],
      },
    });
  });

  it("400s and inserts nothing when any account id is not in the household", async () => {
    const insertMany = vi.fn().mockResolvedValue([]);
    requireHousehold.mockResolvedValue({
      repo: {
        accounts: {
          list: vi.fn().mockResolvedValue([{ id: "a1" }]),
          balances: { insertMany },
        },
      },
    });

    const res = await POST(
      postReq({ balances: [{ accountId: "a1", balance: 1 }, { accountId: "intruder", balance: 1 }] }),
    );
    expect(res.status).toBe(400);
    expect(insertMany).not.toHaveBeenCalled();
  });
});
