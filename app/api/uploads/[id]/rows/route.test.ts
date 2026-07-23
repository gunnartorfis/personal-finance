import { beforeEach, describe, expect, it, vi } from "vitest";

const requireHousehold = vi.fn();
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }));

const appendTransactions = vi.fn();
vi.mock("@/lib/ingestion/append", () => ({
  appendTransactions: (...a: unknown[]) => appendTransactions(...a),
}));

const recordActivity = vi.fn();
vi.mock("@/lib/activity/record", () => ({
  recordActivity: (...a: unknown[]) => recordActivity(...a),
}));

import { POST } from "./route";

const UPLOAD = "11111111-1111-1111-1111-111111111111";
const ACCOUNT = "22222222-2222-2222-2222-222222222222";

const findById = vi.fn();
const ctx = {
  memberId: "m1",
  householdId: "h1",
  user: { id: "u1", name: "A" },
  repo: { uploads: { findById: (...a: unknown[]) => findById(...a) } },
};

const post = (id: string, body: unknown) =>
  POST({ json: async () => body } as unknown as Request, {
    params: Promise.resolve({ id }),
  });

const validBody = {
  date: "2026-03-05",
  amount: -650,
  merchant: "BÓNUS",
  category: "Verslun",
  sourceRow: 1,
};

beforeEach(() => {
  requireHousehold.mockReset();
  appendTransactions.mockReset();
  recordActivity.mockReset();
  findById.mockReset();
  requireHousehold.mockResolvedValue(ctx);
  findById.mockResolvedValue({ id: UPLOAD, accountId: ACCOUNT });
  appendTransactions.mockResolvedValue({ appended: 1, duplicates: 0, alreadyImported: [] });
});

describe("POST /api/uploads/:id/rows", () => {
  it("400s an invalid upload id", async () => {
    const res = await post("not-a-uuid", validBody);
    expect(res.status).toBe(400);
    expect(appendTransactions).not.toHaveBeenCalled();
  });

  it("404s when the upload doesn't belong to the household", async () => {
    findById.mockResolvedValueOnce(undefined);
    const res = await post(UPLOAD, validBody);
    expect(res.status).toBe(404);
    expect(appendTransactions).not.toHaveBeenCalled();
  });

  it("400s a non-ISO date, non-integer amount, or empty merchant", async () => {
    expect((await post(UPLOAD, { ...validBody, date: "05.03.2026" })).status).toBe(400);
    expect((await post(UPLOAD, { ...validBody, amount: 6.5 })).status).toBe(400);
    expect((await post(UPLOAD, { ...validBody, merchant: "   " })).status).toBe(400);
    expect(appendTransactions).not.toHaveBeenCalled();
  });

  it("appends the corrected row to the upload's account and logs the recovery", async () => {
    const res = await post(UPLOAD, validBody);
    expect(res.status).toBe(201);
    expect(appendTransactions).toHaveBeenCalledOnce();
    const input = appendTransactions.mock.calls[0]?.[1] as {
      uploadId: string;
      accountId: string;
      rows: ParsedLike[];
    };
    expect(input).toMatchObject({ uploadId: UPLOAD, accountId: ACCOUNT });
    expect(input.rows[0]).toMatchObject({
      date: "2026-03-05",
      amount: -650,
      merchant: "BÓNUS",
      rawCategory: "Verslun",
      sourceRow: 1,
    });
    expect(recordActivity).toHaveBeenCalledOnce();
    expect(recordActivity.mock.calls[0]?.[1]).toBe("upload.rows_recovered");
    expect(await res.json()).toMatchObject({ appended: 1, duplicates: 0 });
  });

  it("reports a duplicate when the fixed row already exists (dedup)", async () => {
    appendTransactions.mockResolvedValueOnce({
      appended: 0,
      duplicates: 1,
      alreadyImported: [{ sourceRow: 1 }],
    });
    const res = await post(UPLOAD, validBody);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ appended: 0, duplicates: 1 });
  });
});

type ParsedLike = {
  date: string;
  amount: number;
  merchant: string;
  rawCategory: string;
  sourceRow: number;
};
