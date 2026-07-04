import { NextResponse } from "next/server"

import { ActivityAction } from "@/lib/activity/actions"
import { recordActivity } from "@/lib/activity/record"
import { requireHousehold } from "@/lib/household/current"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Cap on the free-text exclusion note; long enough for a reason, bounded so it can't bloat a row. */
const MAX_NOTE_LENGTH = 280

/**
 * Manually exclude a Transaction from every calculation, or re-include it (ADR-0011). Excluding is
 * how a debit that is not true household spending — reimbursed by someone else, a mistaken charge,
 * or a cost fronted for another party (the "grandma's vacuum") — leaves Spending / net math; any
 * sign qualifies. The transaction is resolved through the household-scoped repo first, so another
 * tenant's id is a 404, never a silent write. Excluding also clears any income mark (the two states
 * are mutually exclusive).
 *
 * - PUT    — exclude the transaction; an optional JSON body `{ note }` records why.
 * - DELETE — re-include it (and clear the note).
 */
async function setExcluded(id: string, excluded: boolean, note: string | null) {
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "invalid transaction id" },
      { status: 400 }
    )
  }

  const ctx = await requireHousehold()
  const { repo } = ctx
  const transaction = await repo.transactions.findById(id)
  if (!transaction) {
    return NextResponse.json(
      { error: "transaction not found" },
      { status: 404 }
    )
  }

  const [updated] = await repo.transactions.setExcluded(id, excluded, note)
  if (!updated) {
    // The row can vanish between findById and the update.
    return NextResponse.json(
      { error: "transaction not found" },
      { status: 404 }
    )
  }
  // Only log a real change — re-including an already-included row (or re-excluding with the same
  // note) is a no-op and must not write a spurious audit entry.
  const changed =
    updated.excluded !== transaction.excluded ||
    updated.exclusionNote !== transaction.exclusionNote
  if (changed) {
    await recordActivity(
      ctx,
      excluded ? ActivityAction.TransactionExcluded : ActivityAction.TransactionIncluded,
      { transactionId: id, merchant: transaction.merchant, amount: transaction.amount, note },
    )
  }
  return NextResponse.json({
    id: updated.id,
    excluded: updated.excluded,
    exclusionNote: updated.exclusionNote,
  })
}

/**
 * Read an optional `note` from the request body, tolerating an absent or non-JSON body (the note is
 * optional). A blank note collapses to null; anything over {@link MAX_NOTE_LENGTH} or of the wrong
 * type is a 400 rather than a silently truncated / coerced value.
 */
async function readNote(
  request: Request
): Promise<{ note: string | null } | { error: string }> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { note: null }
  }
  if (body === null || body === undefined) return { note: null }
  if (typeof body !== "object") return { error: "invalid body" }
  const raw = (body as { note?: unknown }).note
  if (raw === undefined || raw === null) return { note: null }
  if (typeof raw !== "string") return { error: "note must be a string" }
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { note: null }
  if (trimmed.length > MAX_NOTE_LENGTH) return { error: "note too long" }
  return { note: trimmed }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const parsed = await readNote(request)
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  return setExcluded(id, true, parsed.note)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return setExcluded(id, false, null)
}
