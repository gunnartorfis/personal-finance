import { beforeEach, describe, expect, it, vi } from "vitest";

const requireHousehold = vi.fn();
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }));

const recordActivity = vi.fn();
vi.mock("@/lib/activity/record", () => ({
  recordActivity: (...a: unknown[]) => recordActivity(...a),
}));

import { POST } from "./route";

const UPLOAD = "11111111-1111-1111-1111-111111111111";

const undo = vi.fn();
const ctx = {
  memberId: "m1",
  householdId: "h1",
  user: { id: "u1", name: "A" },
  repo: { uploads: { undo: (...a: unknown[]) => undo(...a) } },
};

const post = (id: string) =>
  POST({} as unknown as Request, { params: Promise.resolve({ id }) });

beforeEach(() => {
  requireHousehold.mockReset();
  recordActivity.mockReset();
  undo.mockReset();
  requireHousehold.mockResolvedValue(ctx);
  undo.mockResolvedValue({ status: "undone", upload: { id: UPLOAD }, archived: 3 });
});

describe("POST /api/uploads/:id/undo", () => {
  it("400s an invalid upload id", async () => {
    const res = await post("not-a-uuid");
    expect(res.status).toBe(400);
    expect(undo).not.toHaveBeenCalled();
  });

  it("404s when the upload doesn't belong to the household", async () => {
    undo.mockResolvedValueOnce({ status: "not-found" });
    const res = await post(UPLOAD);
    expect(res.status).toBe(404);
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("undoes the upload, returns the archived count, and logs the undo", async () => {
    const res = await post(UPLOAD);
    expect(res.status).toBe(200);
    expect(undo).toHaveBeenCalledWith(UPLOAD, "m1");
    expect(await res.json()).toMatchObject({ status: "undone", archived: 3 });
    expect(recordActivity).toHaveBeenCalledOnce();
    expect(recordActivity.mock.calls[0]?.[1]).toBe("upload.undone");
    expect(recordActivity.mock.calls[0]?.[2]).toMatchObject({ uploadId: UPLOAD, archived: 3 });
  });

  it("returns 200 for an already-undone upload without logging (idempotent)", async () => {
    undo.mockResolvedValueOnce({ status: "already-undone", upload: { id: UPLOAD }, archived: 0 });
    const res = await post(UPLOAD);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "already-undone", archived: 0 });
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("still returns 200 when the activity-log write fails, never masking a committed undo", async () => {
    recordActivity.mockRejectedValueOnce(new Error("log down"));
    const res = await post(UPLOAD);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "undone", archived: 3 });
  });
});
