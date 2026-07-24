import { beforeEach, describe, expect, it, vi } from "vitest";

const requireHousehold = vi.fn();
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }));

const recordActivity = vi.fn();
vi.mock("@/lib/activity/record", () => ({ recordActivity: (...a: unknown[]) => recordActivity(...a) }));

import { POST } from "./route";

const postReq = (body: unknown) =>
  new Request("http://test/", { method: "POST", body: JSON.stringify(body) });

function ctx(accounts: { id: string }[], created: Record<string, unknown> = { id: "new" }) {
  const createManual = vi.fn().mockResolvedValue(created);
  requireHousehold.mockResolvedValue({
    repo: {
      accounts: { list: vi.fn().mockResolvedValue(accounts) },
      transactions: { createManual },
    },
    memberId: "m1",
    user: { name: "Ada", email: "a@x.is" },
  });
  return { createManual };
}

const valid = {
  accountId: "a1",
  date: "2026-03-12",
  amount: -1500,
  merchant: "Cash lunch",
};

beforeEach(() => {
  requireHousehold.mockReset();
  recordActivity.mockReset();
});

describe("POST /api/transactions (manual insert)", () => {
  it("400s a malformed body before resolving the household", async () => {
    expect((await POST(postReq({}))).status).toBe(400);
    expect((await POST(postReq({ ...valid, merchant: "  " }))).status).toBe(400);
    expect((await POST(postReq({ ...valid, date: "12/03/2026" }))).status).toBe(400);
    expect(requireHousehold).not.toHaveBeenCalled();
  });

  it("400s a zero or non-finite amount", async () => {
    expect((await POST(postReq({ ...valid, amount: 0 }))).status).toBe(400);
    expect((await POST(postReq({ ...valid, amount: "lots" }))).status).toBe(400);
    expect(requireHousehold).not.toHaveBeenCalled();
  });

  it("400s and inserts nothing when the account is not in the household", async () => {
    const { createManual } = ctx([{ id: "a1" }]);
    const res = await POST(postReq({ ...valid, accountId: "intruder" }));
    expect(res.status).toBe(400);
    expect(createManual).not.toHaveBeenCalled();
  });

  it("creates a manual transaction, rounds the amount, and logs it", async () => {
    const { createManual } = ctx([{ id: "a1" }], { id: "t-new", merchant: "Cash lunch" });
    const res = await POST(postReq({ ...valid, amount: -1500.6 }));
    expect(res.status).toBe(201);
    expect(createManual).toHaveBeenCalledWith({
      accountId: "a1",
      date: "2026-03-12",
      amount: -1501,
      merchant: "Cash lunch",
    });
    expect(recordActivity).toHaveBeenCalledWith(
      expect.anything(),
      "transaction.created",
      expect.objectContaining({ transactionId: "t-new", merchant: "Cash lunch", amount: -1501 }),
    );
  });

  it("passes a chosen expense type through for a debit", async () => {
    const { createManual } = ctx([{ id: "a1" }]);
    await POST(postReq({ ...valid, expenseType: "Necessary" }));
    expect(createManual).toHaveBeenCalledWith(
      expect.objectContaining({ expenseType: "Necessary" }),
    );
  });

  it("400s an expense type on a credit (types are debit-only)", async () => {
    const { createManual } = ctx([{ id: "a1" }]);
    const res = await POST(postReq({ ...valid, amount: 5000, expenseType: "Necessary" }));
    expect(res.status).toBe(400);
    expect(createManual).not.toHaveBeenCalled();
  });

  it("400s an invalid expense type", async () => {
    const { createManual } = ctx([{ id: "a1" }]);
    const res = await POST(postReq({ ...valid, expenseType: "Luxury" }));
    expect(res.status).toBe(400);
    expect(createManual).not.toHaveBeenCalled();
  });

  it("400s a calendar-invalid date before touching the database", async () => {
    expect((await POST(postReq({ ...valid, date: "2026-13-45" }))).status).toBe(400);
    expect((await POST(postReq({ ...valid, date: "2026-02-30" }))).status).toBe(400);
    expect(requireHousehold).not.toHaveBeenCalled();
  });

  it("400s an amount outside the integer column's range", async () => {
    expect((await POST(postReq({ ...valid, amount: 9_000_000_000 }))).status).toBe(400);
    expect(requireHousehold).not.toHaveBeenCalled();
  });

  it("still returns 201 when activity logging fails (the row was created)", async () => {
    const { createManual } = ctx([{ id: "a1" }], { id: "t-new", merchant: "Cash lunch" });
    recordActivity.mockRejectedValueOnce(new Error("activity log down"));
    const res = await POST(postReq(valid));
    expect(res.status).toBe(201);
    expect(createManual).toHaveBeenCalled();
  });
});
