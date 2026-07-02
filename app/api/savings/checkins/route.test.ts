import { beforeEach, describe, expect, it, vi } from "vitest";

const requireHousehold = vi.fn();
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }));

const performCheckin = vi.fn();
vi.mock("@/lib/savings/checkin", () => ({
  performCheckin: (...args: unknown[]) => performCheckin(...args),
}));

import { GET, POST } from "./route";

const postReq = (body?: unknown) =>
  new Request("http://test/", {
    method: "POST",
    body: body === undefined ? null : JSON.stringify(body),
  });

beforeEach(() => {
  requireHousehold.mockReset();
  performCheckin.mockReset();
});

describe("GET /api/savings/checkins", () => {
  it("returns the household's check-in history", async () => {
    const rows = [{ id: "c1", cycleKey: "2026-06", inferredSaving: 250_000 }];
    requireHousehold.mockResolvedValue({
      repo: { savings: { checkins: { list: vi.fn().mockResolvedValue(rows) } } },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(rows);
  });
});

describe("POST /api/savings/checkins", () => {
  it("400s an invalid cycleExtra before resolving the household", async () => {
    const res = await POST(postReq({ cycleExtra: -5 }));
    expect(res.status).toBe(400);
    expect(requireHousehold).not.toHaveBeenCalled();
  });

  it("freezes the current cycle and returns the check-in with its assessment", async () => {
    const repo = { savings: {} };
    requireHousehold.mockResolvedValue({ repo });
    const payload = {
      ok: true,
      checkin: { id: "c2", cycleKey: "2026-07" },
      assessment: { cycleKey: "2026-07", onTrack: true },
    };
    performCheckin.mockResolvedValue(payload);

    const res = await POST(postReq({ cycleExtra: 120_000 }));
    expect(res.status).toBe(200);
    expect(performCheckin).toHaveBeenCalledWith(repo, expect.any(Date), 120_000);
    expect(await res.json()).toEqual({
      checkin: payload.checkin,
      assessment: payload.assessment,
    });
  });

  it("accepts an empty body as a plain check-in", async () => {
    requireHousehold.mockResolvedValue({ repo: {} });
    performCheckin.mockResolvedValue({ ok: true, checkin: {}, assessment: {} });

    const res = await POST(postReq());
    expect(res.status).toBe(200);
    expect(performCheckin).toHaveBeenCalledWith({}, expect.any(Date), 0);
  });

  it("409s when no goal is set", async () => {
    requireHousehold.mockResolvedValue({ repo: {} });
    performCheckin.mockResolvedValue({ ok: false, error: "no-goal" });

    const res = await POST(postReq({}));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "no-goal" });
  });

  it("409s a check-in before the goal's start cycle", async () => {
    requireHousehold.mockResolvedValue({ repo: {} });
    performCheckin.mockResolvedValue({ ok: false, error: "before-start-cycle" });

    const res = await POST(postReq({}));
    expect(res.status).toBe(409);
  });
});
