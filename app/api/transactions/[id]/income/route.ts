import { NextResponse } from "next/server"

import { ActivityAction } from "@/lib/activity/actions"
import { recordActivity } from "@/lib/activity/record"
import { requireHousehold } from "@/lib/household/current"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Manual income marking for a credit (ADR-0009). Credits count for nothing in any calculation
 * unless marked — most are inter-account transfers, card-bill payments, or refunds. Both verbs
 * resolve the transaction through the household-scoped repo first, so another tenant's id is a
 * 404 — never a silent write. Only a credit (`amount > 0`) can be marked; a debit is a 409.
 *
 * - PUT    — mark the credit as income.
 * - DELETE — unmark it (back to excluded).
 */
async function setMarked(id: string, incomeMarked: boolean) {
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid transaction id" }, { status: 400 })
  }

  const ctx = await requireHousehold()
  const { repo } = ctx
  const transaction = await repo.transactions.findById(id)
  if (!transaction) {
    return NextResponse.json({ error: "transaction not found" }, { status: 404 })
  }
  if (transaction.amount <= 0) {
    return NextResponse.json(
      { error: "only a credit can be marked as income" },
      { status: 409 }
    )
  }
  // Income and Excluded are mutually exclusive (ADR-0011); marking an excluded credit would trip the
  // DB CHECK. Reject it cleanly with a 409 instead. Unmarking (incomeMarked=false) stays allowed.
  if (incomeMarked && transaction.excluded) {
    return NextResponse.json(
      { error: "an excluded transaction can't be marked as income; include it first" },
      { status: 409 }
    )
  }

  const [updated] = await repo.transactions.setIncomeMarked(id, incomeMarked)
  if (!updated) {
    // The row can vanish (or stop qualifying) between findById and the guarded update.
    return NextResponse.json({ error: "transaction not found" }, { status: 404 })
  }
  await recordActivity(
    ctx,
    incomeMarked
      ? ActivityAction.TransactionIncomeMarked
      : ActivityAction.TransactionIncomeUnmarked,
    { transactionId: id, merchant: transaction.merchant, amount: transaction.amount },
  )
  return NextResponse.json({ id: updated.id, incomeMarked: updated.incomeMarked })
}

export async function PUT(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return setMarked(id, true)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return setMarked(id, false)
}
