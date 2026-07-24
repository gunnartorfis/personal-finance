import { NextResponse } from "next/server";

import { ActivityAction } from "@/lib/activity/actions";
import { recordActivity } from "@/lib/activity/record";
import { requireHousehold } from "@/lib/household/current";
import { detectAndLinkTransfers } from "@/lib/transactions/link-transfers";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/uploads/:id/restore — restore an undone Upload (ADR-0024), the inverse of undo.
 * Un-archives all of its Transactions (bringing them back into the transactions list and every
 * calculation) and clears the undo timestamp/actor, then re-runs transfer detection so the
 * now-unarchived legs re-pair. The restore is written to the Activity log (ADR-0017). 400 on an
 * invalid id, 404 for an unknown upload, 409 when the file was already re-imported (restoring would
 * duplicate the now-live rows), 200 otherwise — including the idempotent no-op when the Upload was
 * never undone (a second restore is a no-op, not an error).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid upload id" }, { status: 400 });
  }

  const ctx = await requireHousehold();
  const result = await ctx.repo.uploads.restore(id);
  if (result.status === "not-found") {
    return NextResponse.json({ error: "upload not found" }, { status: 404 });
  }
  if (result.status === "superseded") {
    // The file was re-imported after this Upload was undone; restoring would duplicate the now-live
    // rows, so Restore is withdrawn (ADR-0024 clean-slate).
    return NextResponse.json(
      { error: "upload was already re-imported", ...result },
      { status: 409 },
    );
  }
  if (result.status === "conflict") {
    // A concurrent undo/restore changed the Upload between our read and write (ADR-0024). The client
    // should refresh and retry rather than act on a stale view.
    return NextResponse.json({ error: "upload changed, please retry", ...result }, { status: 409 });
  }

  // A real restore (status "restored"): re-pair transfers and log, both best-effort — mirror the
  // rows route. Only scan when rows were actually un-archived; an empty restore has nothing to pair.
  if (result.status === "restored") {
    if (result.restored > 0) {
      try {
        await detectAndLinkTransfers(ctx.repo);
      } catch {
        // Re-runnable enrichment; the next import retries the same scan.
      }
    }
    try {
      await recordActivity(ctx, ActivityAction.UploadRestored, {
        uploadId: id,
        restored: result.restored,
      });
    } catch {
      // The restore already succeeded; a logging failure must not mask it.
    }
  }

  return NextResponse.json(result, { status: 200 });
}
