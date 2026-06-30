import { NextResponse } from "next/server";

import { requireHousehold } from "@/lib/household/current";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/uploads/:id/progress — classification progress for one of the current Household's
 * uploads (ADR-0005). Returns `{ total, pending, classified, failed, done }`; `done` is true once
 * no rows remain pending, which is the signal for a polling client to stop. The upload is resolved
 * through the household-scoped repo, so another tenant's id yields 404 rather than leaking counts.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid upload id" }, { status: 400 });
  }

  const { repo } = await requireHousehold();
  const upload = await repo.uploads.findById(id);
  if (!upload) {
    return NextResponse.json({ error: "upload not found" }, { status: 404 });
  }

  const counts = await repo.transactions.progress(id);
  // `done` requires at least one row: total === 0 means the rows aren't visible yet, not finished —
  // reporting done there would make a client stop polling before any transaction is classified.
  return NextResponse.json({ ...counts, done: counts.total > 0 && counts.pending === 0 });
}
