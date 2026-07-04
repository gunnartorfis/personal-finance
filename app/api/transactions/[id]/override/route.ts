import { NextResponse } from "next/server"

import { ActivityAction } from "@/lib/activity/actions"
import { recordActivity } from "@/lib/activity/record"
import { requireHousehold } from "@/lib/household/current"
import { isExpenseType, type ExpenseType } from "@/shared/types"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Manual overrides for a transaction (Phase F, ADR-0020). An override takes precedence over the
 * classified value everywhere it's read (dashboard net summary + category breakdown). The two axes
 * are independent: a request may set the Expense type, the semantic Category, or both. Both verbs
 * resolve the transaction through the household-scoped repo first, so another tenant's id is a 404 —
 * never a silent write. `""` is a valid Expense-type override (the not-bucketed / split type).
 *
 * - PUT  `{ expenseType?, categoryId? }` — set/change either axis (at least one required).
 * - DELETE                              — clear the whole override, reverting to classified/rule.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid transaction id" }, { status: 400 })
  }

  const body = (await request.json().catch(() => null)) as {
    expenseType?: unknown
    categoryId?: unknown
  } | null
  const hasType = body?.expenseType !== undefined
  const hasCategory = body?.categoryId !== undefined && body?.categoryId !== null
  if (!hasType && !hasCategory) {
    return NextResponse.json({ error: "provide expenseType and/or categoryId" }, { status: 400 })
  }
  if (hasType && !isExpenseType(body!.expenseType)) {
    return NextResponse.json({ error: "invalid expenseType" }, { status: 400 })
  }
  if (hasCategory && (typeof body!.categoryId !== "string" || !UUID_RE.test(body!.categoryId))) {
    return NextResponse.json({ error: "invalid categoryId" }, { status: 400 })
  }
  const expenseType = hasType ? (body!.expenseType as ExpenseType) : undefined
  const categoryId = hasCategory ? (body!.categoryId as string) : undefined

  const ctx = await requireHousehold()
  const { repo, memberId } = ctx
  const transaction = await repo.transactions.findById(id)
  if (!transaction) {
    return NextResponse.json({ error: "transaction not found" }, { status: 404 })
  }
  // The Category (when set) must be one of this Household's own, visible leaves — same guard as the
  // classifier/rule paths (ADR-0020), so a group/hidden/foreign id is a clean 400, not a 500 on the FK.
  if (categoryId !== undefined) {
    const visibleLeafIds = new Set((await repo.categories.leafSlugToId()).values())
    if (!visibleLeafIds.has(categoryId)) {
      return NextResponse.json({ error: "invalid categoryId" }, { status: 400 })
    }
  }

  const [override] = await repo.overrides.upsert({ transactionId: id, expenseType, categoryId, memberId })
  if (override) {
    if (expenseType !== undefined) {
      await recordActivity(ctx, ActivityAction.TransactionRetyped, {
        transactionId: id,
        merchant: transaction.merchant,
        expenseType,
      })
    }
    if (categoryId !== undefined) {
      await recordActivity(ctx, ActivityAction.TransactionRecategorized, {
        transactionId: id,
        merchant: transaction.merchant,
      })
    }
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
