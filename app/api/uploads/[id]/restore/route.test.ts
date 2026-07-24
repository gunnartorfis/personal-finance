import { beforeEach, describe, expect, it, vi } from "vitest";

const requireHousehold = vi.fn();
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }));

const recordActivity = vi.fn();
vi.mock("@/lib/activity/record", () => ({
  recordActivity: (...a: unknown[]) => recordActivity(...a),
}));

const detectAndLinkTransfers = vi.fn();
vi.mock("@/lib/transactions/link-transfers", () => ({
  detectAndLinkTransfers: (...a: unknown[]) => detectAndLinkTransfers(...a),
}));

import { POST } from "./route";

const UPLOAD = "11111111-1111-1111-1111-111111111111";

const restore = vi.fn();
const ctx = {
  memberId: "m1",
  householdId: "h1",
  user: { id: "u1", name: "A" },
  repo: { uploads: { restore: (...a: unknown[]) => restore(...a) } },
};

const post = (id: string) =>
  POST({} as unknown as Request, { params: Promise.resolve({ id }) });

beforeEach(() => {
  requireHousehold.mockReset();
  recordActivity.mockReset();
  detectAndLinkTransfers.mockReset();
  restore.mockReset();
  requireHousehold.mockResolvedValue(ctx);
  detectAndLinkTransfers.mockResolvedValue({ linked: 0 });
  restore.mockResolvedValue({ status: "restored", upload: { id: UPLOAD }, restored: 3 });
});

describe("POST /api/uploads/:id/restore", () => {
  it("400s an invalid upload id", async () => {
    const res = await post("not-a-uuid");
    expect(res.status).toBe(400);
    expect(restore).not.toHaveBeenCalled();
  });

  it("404s when the upload doesn't belong to the household", async () => {
    restore.mockResolvedValueOnce({ status: "not-found" });
    const res = await post(UPLOAD);
    expect(res.status).toBe(404);
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("409s when the file was already re-imported (superseded)", async () => {
    restore.mockResolvedValueOnce({ status: "superseded", upload: { id: UPLOAD }, restored: 0 });
    const res = await post(UPLOAD);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      status: "superseded",
      error: "upload was already re-imported",
    });
    expect(detectAndLinkTransfers).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("restores the upload, re-pairs transfers, returns the count, and logs the restore", async () => {
    const res = await post(UPLOAD);
    expect(res.status).toBe(200);
    expect(restore).toHaveBeenCalledWith(UPLOAD);
    expect(await res.json()).toMatchObject({ status: "restored", restored: 3 });
    expect(detectAndLinkTransfers).toHaveBeenCalledOnce();
    expect(recordActivity).toHaveBeenCalledOnce();
    expect(recordActivity.mock.calls[0]?.[1]).toBe("upload.restored");
    expect(recordActivity.mock.calls[0]?.[2]).toMatchObject({ uploadId: UPLOAD, restored: 3 });
  });

  it("skips transfer re-pairing when nothing was un-archived, but still logs the restore", async () => {
    restore.mockResolvedValueOnce({ status: "restored", upload: { id: UPLOAD }, restored: 0 });
    const res = await post(UPLOAD);
    expect(res.status).toBe(200);
    expect(detectAndLinkTransfers).not.toHaveBeenCalled();
    expect(recordActivity).toHaveBeenCalledOnce();
  });

  it("returns 200 for an already-active upload without logging (idempotent no-op)", async () => {
    restore.mockResolvedValueOnce({ status: "not-undone", upload: { id: UPLOAD }, restored: 0 });
    const res = await post(UPLOAD);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "not-undone", restored: 0 });
    expect(detectAndLinkTransfers).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("still returns 200 when the activity-log write fails, never masking a committed restore", async () => {
    recordActivity.mockRejectedValueOnce(new Error("log down"));
    const res = await post(UPLOAD);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "restored", restored: 3 });
  });
});
