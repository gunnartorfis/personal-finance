import { beforeEach, describe, expect, it, vi } from "vitest";

const requireHousehold = vi.fn();
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }));

const backfillCategories = vi.fn();
vi.mock("@/lib/classification/backfill-categories", () => ({
  backfillCategories: (...args: unknown[]) => backfillCategories(...args),
}));

// The real classifier makes a gateway call; stub it so the route wiring is tested in isolation.
const sonnetClassifier = vi.fn(() => "CLASSIFIER");
vi.mock("@/lib/classification/sonnet-classifier", () => ({ sonnetClassifier: () => sonnetClassifier() }));

import { POST } from "./route";

beforeEach(() => {
  requireHousehold.mockReset();
  backfillCategories.mockReset();
});

describe("POST /api/classify/backfill-categories", () => {
  it("runs the backfill for the household and returns the batch counts", async () => {
    const repo = { id: "repo" };
    requireHousehold.mockResolvedValue({ repo });
    backfillCategories.mockResolvedValue({ scanned: 3, backfilled: 2, failed: 0 });

    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scanned: 3, backfilled: 2, failed: 0 });
    // Wired: (repo, classifier, { limit }).
    expect(backfillCategories).toHaveBeenCalledWith(repo, "CLASSIFIER", { limit: 25 });
  });

  it("returns a structured 500 on an infrastructure failure", async () => {
    requireHousehold.mockResolvedValue({ repo: {} });
    backfillCategories.mockRejectedValue(new Error("db down"));
    const res = await POST();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "backfill_failed" });
  });
});
