import { NextResponse } from "next/server"

import { ActivityAction } from "@/lib/activity/actions"
import { recordActivity } from "@/lib/activity/record"
import { requireHousehold } from "@/lib/household/current"
import { detectAndLinkTransfers } from "@/lib/transactions/link-transfers"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Soft-delete a single Transaction, or restore one (ADR-0026). Deleting hides the row from the
 * transactions list and every calculation while retaining it (append-only), reversibly — a per-row
 * analog of the whole-Upload undo (ADR-0024), but on a manually-owned row. Bank-sync rows are not
 * deletable (a re-Sync would re-add them). The transaction is resolved through the household-scoped
 * repo first, so another tenant's id is a 404, never a silent write.
 *
 * - PUT    — soft-delete the transaction (idempotent; already-deleted is a no-op success).
 * - DELETE — restore it (idempotent; a live row is a no-op success).
 */
async function resolve(id: string) {
  if (!UUID_RE.test(id)) {
    return { ok: false as const, response: NextResponse.json({ error: "invalid transaction id" }, { status: 400 }) }
  }
  const ctx = await requireHousehold()
  const transaction = await ctx.repo.transactions.findById(id)
  if (!transaction) {
    return { ok: false as const, response: NextResponse.json({ error: "transaction not found" }, { status: 404 }) }
  }
  return { ok: true as const, ctx, transaction }
}

export async function PUT(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  const resolved = await resolve(id)
  if (!resolved.ok) return resolved.response
  const { ctx, transaction } = resolved

  // A synced row would just reappear on the next Sync, so deleting it is meaningless — refuse it
  // explicitly (409) rather than silently no-op, since the row does exist.
  if (transaction.source === "bank_sync") {
    return NextResponse.json(
      { error: "cannot delete a synced transaction" },
      { status: 409 }
    )
  }

  const [updated] = await ctx.repo.transactions.softDelete(id)
  // An empty result means the row was already soft-deleted (bank-sync and foreign ids are handled
  // above) — idempotent success, and no spurious audit entry for a no-op.
  if (updated) {
    // Best-effort audit: the delete is already committed, so a logging failure must not surface as a
    // failed request — that would leave the client showing failure while the row is gone.
    try {
      await recordActivity(ctx, ActivityAction.TransactionDeleted, {
        transactionId: id,
        merchant: transaction.merchant,
        amount: transaction.amount,
      })
    } catch {
      // The soft-delete succeeded; swallow the logging error.
    }
  }
  return NextResponse.json({
    id,
    deletedAt: (updated?.deletedAt ?? transaction.deletedAt) ?? null,
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  const resolved = await resolve(id)
  if (!resolved.ok) return resolved.response
  const { ctx, transaction } = resolved

  const [updated] = await ctx.repo.transactions.restoreDeleted(id)
  // `restoreDeleted` is guarded on `deletedAt IS NOT NULL`, so a non-empty result means THIS request
  // is the one that flipped the row — act only then. Restoring a live row, or losing a
  // concurrent-restore race, returns [] and does nothing (no duplicate audit entry, no rescan).
  if (updated) {
    // Deleting a transfer leg unlinked the pair (both legs' `transferGroupId` cleared); re-run
    // detection so a restored leg re-pairs with its partner, matching the upload-restore route
    // (ADR-0024). Best-effort — a restore must not fail on this re-runnable enrichment.
    try {
      await detectAndLinkTransfers(ctx.repo)
    } catch {
      // Re-runnable; the next import retries the same scan.
    }
    // Best-effort audit, like the delete path — the restore is already committed.
    try {
      await recordActivity(ctx, ActivityAction.TransactionRestored, {
        transactionId: id,
        merchant: transaction.merchant,
        amount: transaction.amount,
      })
    } catch {
      // The restore succeeded; swallow the logging error.
    }
  }
  return NextResponse.json({ id, deletedAt: null })
}
