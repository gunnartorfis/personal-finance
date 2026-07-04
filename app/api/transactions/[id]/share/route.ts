import { NextResponse } from "next/server"

import { ActivityAction } from "@/lib/activity/actions"
import { recordActivity } from "@/lib/activity/record"
import { requireHousehold } from "@/lib/household/current"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Set or clear a Transaction's Own share — mark it a Shared expense (ADR-0014). Only the Household's
 * Own share of such a debit counts as Spending; the remainder was fronted for other parties and
 * drops from all math, exactly like the fronted-for-others part of Excluded (ADR-0011). The incoming
 * paybacks need no handling — as unmarked credits they already count for nothing (ADR-0009). The
 * charged `amount` is never mutated (append-only source of truth, ADR-0003/0004); the share only
 * shrinks how much counts as spend.
 *
 * The transaction is resolved through the household-scoped repo first, so another tenant's id is a
 * 404, never a silent write.
 *
 * - PUT    — body `{ ownShareAmount }` (negative integer, `amount < ownShareAmount < 0`; a share
 *   equal to the charge is a no-op and is rejected).
 * - DELETE — clear the share, returning the row to its full charged amount.
 */
async function readOwnShare(
  request: Request
): Promise<{ ownShareAmount: number } | { error: string }> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { error: "invalid body" }
  }
  if (body === null || typeof body !== "object") {
    return { error: "invalid body" }
  }
  const raw = (body as { ownShareAmount?: unknown }).ownShareAmount
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    return { error: "ownShareAmount must be an integer" }
  }
  // A share is a real, nonzero expense (a share of zero is Excluded instead, ADR-0014).
  if (raw >= 0) {
    return { error: "ownShareAmount must be negative" }
  }
  return { ownShareAmount: raw }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid transaction id" }, { status: 400 })
  }

  const parsed = await readOwnShare(request)
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const ctx = await requireHousehold()
  const { repo } = ctx
  const transaction = await repo.transactions.findById(id)
  if (!transaction) {
    return NextResponse.json({ error: "transaction not found" }, { status: 404 })
  }
  // Splitting a credit is meaningless — incoming paybacks are already math-excluded (ADR-0009).
  if (transaction.amount >= 0) {
    return NextResponse.json(
      { error: "only a debit can be shared" },
      { status: 400 }
    )
  }
  // Excluded drops the whole row; the two states are mutually exclusive. Re-include first.
  if (transaction.excluded) {
    return NextResponse.json(
      { error: "cannot share an excluded transaction" },
      { status: 409 }
    )
  }
  // The share must be a real fraction of the charge: strictly less than the full amount. A share
  // equal to (or larger than) the charge is rejected — equal counts identically to no split, which
  // the ADR calls a no-op to prevent, and larger would exceed the charge (ADR-0014).
  if (parsed.ownShareAmount <= transaction.amount) {
    return NextResponse.json(
      { error: "ownShareAmount must be less than the full charge" },
      { status: 400 }
    )
  }

  const [updated] = await repo.transactions.setOwnShare(id, parsed.ownShareAmount)
  if (!updated) {
    // The row changed (excluded, or vanished) between the read and the guarded write.
    return NextResponse.json(
      { error: "transaction not found" },
      { status: 409 }
    )
  }
  if (updated.ownShareAmount !== transaction.ownShareAmount) {
    await recordActivity(ctx, ActivityAction.TransactionShareSet, {
      transactionId: id,
      merchant: transaction.merchant,
      amount: transaction.amount,
      ownShareAmount: updated.ownShareAmount,
    })
  }
  return NextResponse.json({
    id: updated.id,
    ownShareAmount: updated.ownShareAmount,
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid transaction id" }, { status: 400 })
  }

  const ctx = await requireHousehold()
  const { repo } = ctx
  const transaction = await repo.transactions.findById(id)
  if (!transaction) {
    return NextResponse.json({ error: "transaction not found" }, { status: 404 })
  }

  const [updated] = await repo.transactions.setOwnShare(id, null)
  if (!updated) {
    return NextResponse.json({ error: "transaction not found" }, { status: 404 })
  }
  // Only log a real change — clearing a share on a row that never had one is a no-op.
  if (updated.ownShareAmount !== transaction.ownShareAmount) {
    await recordActivity(ctx, ActivityAction.TransactionShareCleared, {
      transactionId: id,
      merchant: transaction.merchant,
    })
  }
  return NextResponse.json({
    id: updated.id,
    ownShareAmount: updated.ownShareAmount,
  })
}
