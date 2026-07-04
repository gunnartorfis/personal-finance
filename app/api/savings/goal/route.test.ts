import { beforeEach, describe, expect, it, vi } from "vitest";

const requireHousehold = vi.fn();
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }));

import { GET, PUT } from "./route";

const putReq = (body: unknown) =>
  new Request("http://test/", { method: "PUT", body: JSON.stringify(body) });

const goalBody = {
  target: 3_000_000,
  targetDate: "2027-06-01",
  startingSaved: 250_000,
  startCycle: "2026-07",
};

beforeEach(() => requireHousehold.mockReset());

describe("GET /api/savings/goal", () => {
  it("returns the household's goal", async () => {
    const get = vi.fn().mockResolvedValue({ id: "g1", ...goalBody, currency: "ISK" });
    requireHousehold.mockResolvedValue({ repo: { savings: { goal: { get } } } });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "g1", target: 3_000_000 });
  });

  it("returns null when no goal is set", async () => {
    const get = vi.fn().mockResolvedValue(undefined);
    requireHousehold.mockResolvedValue({ repo: { savings: { goal: { get } } } });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });
});

describe("PUT /api/savings/goal", () => {
  it("400s an invalid body before resolving the household", async () => {
    const res = await PUT(putReq({ ...goalBody, target: -1 }));
    expect(res.status).toBe(400);
    expect(requireHousehold).not.toHaveBeenCalled();
  });

  it("upserts a valid goal and returns it", async () => {
    const row = { id: "g1", ...goalBody, currency: "ISK" };
    const upsert = vi.fn().mockResolvedValue([row]);
    const record = vi.fn().mockResolvedValue([]);
    requireHousehold.mockResolvedValue({
      repo: { savings: { goal: { upsert } }, activity: { record } },
      memberId: "m1",
      user: { name: "Ada", email: "ada@x.is" },
    });

    const res = await PUT(putReq(goalBody));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith({ ...goalBody, currency: "ISK" });
    expect(record).toHaveBeenCalledWith({
      memberId: "m1",
      actorName: "Ada",
      action: "savings.goal_updated",
    });
    expect(await res.json()).toMatchObject({ id: "g1" });
  });
});
