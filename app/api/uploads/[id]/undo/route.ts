import { NextResponse } from "next/server";

import { ActivityAction } from "@/lib/activity/actions";
import { recordActivity } from "@/lib/activity/record";
import { requireHousehold } from "@/lib/household/current";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/uploads/:id/undo — undo an Upload (ADR-0024). Archives all of its Transactions (hiding
 * them from the transactions list and every calculation, but retained for a later Restore), stamps
 * the Upload with the undo timestamp/actor, and unlinks any detected transfer pair so a surviving
 * partner leg returns to its natural math treatment. The undo is written to the Activity log
 * (ADR-0017). 400 on an invalid id, 404 for an unknown upload, 200 otherwise — including the
 * idempotent already-undone case (a second undo is a no-op, not an error).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid upload id" }, { status: 400 });
  }

  const ctx = await requireHousehold();
  const result = await ctx.repo.uploads.undo(id, ctx.memberId);
  if (result.status === "not-found") {
    return NextResponse.json({ error: "upload not found" }, { status: 404 });
  }

  // Log only a real undo, best-effort — mirror the rows route: once the undo has committed, a
  // logging hiccup must never fail the request (an already-undone no-op writes no entry).
  if (result.status === "undone") {
    try {
      await recordActivity(ctx, ActivityAction.UploadUndone, {
        uploadId: id,
        archived: result.archived,
      });
    } catch {
      // The undo already succeeded; a logging failure must not mask it.
    }
  }

  return NextResponse.json(result, { status: 200 });
}
