import { beforeEach, describe, expect, it, vi } from "vitest";

const requireHousehold = vi.fn();
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }));

const recordActivity = vi.fn();
vi.mock("@/lib/activity/record", () => ({ recordActivity: (...a: unknown[]) => recordActivity(...a) }));

const detectAndLinkTransfers = vi.fn().mockResolvedValue({ linked: 0 });
vi.mock("@/lib/transactions/link-transfers", () => ({
  detectAndLinkTransfers: (...a: unknown[]) => detectAndLinkTransfers(...a),
}));

import { DELETE, PUT } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://test/", { method: "PUT" });

function ctx(row: Record<string, unknown> | undefined, results: { softDelete?: unknown[]; restoreDeleted?: unknown[] } = {}) {
  const softDelete = vi.fn().mockResolvedValue(results.softDelete ?? []);
  const restoreDeleted = vi.fn().mockResolvedValue(results.restoreDeleted ?? []);
  requireHousehold.mockResolvedValue({
    repo: {
      transactions: { findById: vi.fn().mockResolvedValue(row), softDelete, restoreDeleted },
    },
    memberId: "m1",
    user: { name: "Ada", email: "a@x.is" },
  });
  return { softDelete, restoreDeleted };
}

beforeEach(() => {
  requireHousehold.mockReset();
  recordActivity.mockReset();
  detectAndLinkTransfers.mockClear();
});

describe("PUT /api/transactions/[id]/delete (soft-delete)", () => {
  it("400s a malformed id before resolving the household", async () => {
    const res = await PUT(req(), params("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(requireHousehold).not.toHaveBeenCalled();
  });

  it("404s an unknown / foreign transaction id", async () => {
    ctx(undefined);
    const res = await PUT(req(), params(ID));
    expect(res.status).toBe(404);
  });

  it("409s a bank_sync row and never soft-deletes it", async () => {
    const { softDelete } = ctx({ id: ID, source: "bank_sync", merchant: "X", amount: -1, deletedAt: null });
    const res = await PUT(req(), params(ID));
    expect(res.status).toBe(409);
    expect(softDelete).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("soft-deletes a csv row and logs the action", async () => {
    const { softDelete } = ctx(
      { id: ID, source: "csv", merchant: "Netto", amount: -1234, deletedAt: null },
      { softDelete: [{ id: ID, deletedAt: new Date("2026-07-24T00:00:00Z") }] },
    );
    const res = await PUT(req(), params(ID));
    expect(res.status).toBe(200);
    expect(softDelete).toHaveBeenCalledWith(ID);
    expect(recordActivity).toHaveBeenCalledWith(
      expect.anything(),
      "transaction.deleted",
      expect.objectContaining({ transactionId: ID, merchant: "Netto", amount: -1234 }),
    );
  });

  it("is idempotent on an already-deleted row (no second log)", async () => {
    const { softDelete } = ctx(
      { id: ID, source: "csv", merchant: "Netto", amount: -1234, deletedAt: new Date("2026-07-01T00:00:00Z") },
      { softDelete: [] },
    );
    const res = await PUT(req(), params(ID));
    expect(res.status).toBe(200);
    expect(softDelete).toHaveBeenCalledWith(ID);
    expect(recordActivity).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/transactions/[id]/delete (restore)", () => {
  it("restores a soft-deleted row and logs the action", async () => {
    const { restoreDeleted } = ctx(
      { id: ID, source: "csv", merchant: "Netto", amount: -1234, deletedAt: new Date("2026-07-01T00:00:00Z") },
      { restoreDeleted: [{ id: ID, deletedAt: null }] },
    );
    const res = await DELETE(req(), params(ID));
    expect(res.status).toBe(200);
    expect(restoreDeleted).toHaveBeenCalledWith(ID);
    expect(recordActivity).toHaveBeenCalledWith(
      expect.anything(),
      "transaction.restored",
      expect.objectContaining({ transactionId: ID, merchant: "Netto" }),
    );
    // Re-run transfer detection so a restored transfer leg re-pairs (delete unlinked it), mirroring
    // the upload-restore route (ADR-0024).
    expect(detectAndLinkTransfers).toHaveBeenCalled();
  });

  it("does not log or re-detect when the row was not deleted (no change)", async () => {
    ctx({ id: ID, source: "csv", merchant: "Netto", amount: -1234, deletedAt: null });
    const res = await DELETE(req(), params(ID));
    expect(res.status).toBe(200);
    expect(recordActivity).not.toHaveBeenCalled();
    expect(detectAndLinkTransfers).not.toHaveBeenCalled();
  });

  it("404s an unknown transaction id", async () => {
    ctx(undefined);
    expect((await DELETE(req(), params(ID))).status).toBe(404);
  });
});
