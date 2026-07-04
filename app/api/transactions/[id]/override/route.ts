import { NextResponse } from "next/server"

import { ActivityAction } from "@/lib/activity/actions"
import { recordActivity } from "@/lib/activity/record"
import { requireHousehold } from "@/lib/household/current"
import { isExpenseType } from "@/shared/types"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Manual expense-type override for a transaction (Phase F). The override takes precedence over the
 * classified type everywhere it's read (e.g. the dashboard net summary). Both verbs resolve the
 * transaction through the household-scoped repo first, so another tenant's id is a 404 — never a
 * silent write. `""` is a valid override (the not-bucketed / split type).
 *
 * - PUT  `{ expenseType }` — set or change the override.
 * - DELETE                 — clear it, reverting to the classified type.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid transaction id" }, { status: 400 })
  }

  const body: unknown = await request.json().catch(() => null)
  const expenseType = (body as { expenseType?: unknown } | null)?.expenseType
  if (!isExpenseType(expenseType)) {
    return NextResponse.json({ error: "invalid expenseType" }, { status: 400 })
  }

  const ctx = await requireHousehold()
  const { repo, memberId } = ctx
  const transaction = await repo.transactions.findById(id)
  if (!transaction) {
    return NextResponse.json({ error: "transaction not found" }, { status: 404 })
  }

  const [override] = await repo.overrides.upsert({ transactionId: id, expenseType, memberId })
  if (override) {
    await recordActivity(ctx, ActivityAction.TransactionRetyped, {
      transactionId: id,
      merchant: transaction.merchant,
      expenseType,
    })
  }
  return NextResponse.json(override)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const removed = await repo.overrides.remove(id)
  if (removed.length > 0) {
    // Only a real clear is worth logging — clearing an un-overridden row is a no-op.
    await recordActivity(ctx, ActivityAction.TransactionRetypeCleared, {
      transactionId: id,
      merchant: transaction.merchant,
    })
  }
  return NextResponse.json({ cleared: removed.length > 0 })
}
