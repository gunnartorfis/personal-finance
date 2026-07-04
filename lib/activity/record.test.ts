import { describe, expect, it, vi } from "vitest";

import { recordActivity } from "./record";

function ctxWith(user: { name?: string | null; email?: string | null }) {
  const record = vi.fn().mockResolvedValue([]);
  const ctx = { repo: { activity: { record } }, memberId: "m1", user } as unknown as Parameters<
    typeof recordActivity
  >[0];
  return { record, ctx };
}

describe("recordActivity", () => {
  it("records with the resolved actor name and payload", async () => {
    const { record, ctx } = ctxWith({ name: "Ada", email: "a@x.is" });
    await recordActivity(ctx, "transaction.excluded", {
      transactionId: "t1",
      summary: "Netto",
    });
    expect(record).toHaveBeenCalledWith({
      memberId: "m1",
      actorName: "Ada",
      action: "transaction.excluded",
      payload: { transactionId: "t1", summary: "Netto" },
    });
  });

  it("resolves the actor name from email when no name is set", async () => {
    const { record, ctx } = ctxWith({ email: "a@x.is" });
    await recordActivity(ctx, "transaction.included", { transactionId: "t1" });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ actorName: "a@x.is", action: "transaction.included" }),
    );
  });

  it("omits payload entirely when none is given", async () => {
    const { record, ctx } = ctxWith({ name: "Ada" });
    await recordActivity(ctx, "data.reset");
    expect(record).toHaveBeenCalledWith({
      memberId: "m1",
      actorName: "Ada",
      action: "data.reset",
    });
  });
});
