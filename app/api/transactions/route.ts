import { NextResponse } from "next/server"

import { ActivityAction } from "@/lib/activity/actions"
import { recordActivity } from "@/lib/activity/record"
import { requireHousehold } from "@/lib/household/current"
import { EXPENSE_TYPES, type ExpenseType } from "@/shared/types"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
/** Matches the CSV parser's merchant cap so a manual entry can't exceed what an import allows. */
const MAX_MERCHANT_LENGTH = 200

interface ManualInput {
  accountId: string
  date: string
  amount: number
  merchant: string
  expenseType?: ExpenseType
}

/**
 * Validate a manual-insert body into the repo shape (ADR-0026). Amount is a signed integer in whole
 * billing-currency units (negative = expense), rounded and required non-zero. An optional expense
 * type must be a real bucket ("" is not offered) and only applies to a debit — credits are handled
 * by income marking, not typing. Account membership is checked later against the Household's
 * accounts; here we only validate the shape (no Household needed, so a bad body 400s cheaply).
 */
function parseBody(body: unknown): ManualInput | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "invalid body" }
  const b = body as Record<string, unknown>

  if (typeof b.accountId !== "string" || b.accountId.trim() === "") {
    return { error: "account is required" }
  }
  if (typeof b.date !== "string" || !DATE_RE.test(b.date)) {
    return { error: "date must be YYYY-MM-DD" }
  }
  const amount = typeof b.amount === "number" ? Math.round(b.amount) : NaN
  if (!Number.isFinite(amount) || amount === 0) {
    return { error: "amount must be a non-zero number" }
  }
  const merchant = typeof b.merchant === "string" ? b.merchant.trim() : ""
  if (merchant === "") return { error: "merchant is required" }
  if (merchant.length > MAX_MERCHANT_LENGTH) return { error: "merchant too long" }

  const input: ManualInput = { accountId: b.accountId, date: b.date, amount, merchant }

  if (b.expenseType !== undefined && b.expenseType !== null) {
    // Only the real buckets — the "" (not-bucketed) sentinel is never a manual pick.
    if (b.expenseType === "" || !EXPENSE_TYPES.includes(b.expenseType as ExpenseType)) {
      return { error: "invalid expense type" }
    }
    // Types describe spending; a credit is income (or nothing), never a typed expense.
    if (amount > 0) return { error: "a credit cannot carry an expense type" }
    input.expenseType = b.expenseType as ExpenseType
  }

  return input
}

/**
 * POST /api/transactions — hand-enter a Transaction (ADR-0026). Creates a first-class `manual`-source
 * row scoped to the Household; an optional expense type is stored as an Override (so a typed row skips
 * the AI queue). Body is validated before the Household is resolved, then the account must belong to
 * the Household. The insert is written to the Activity log (ADR-0017). 400 on a bad body or an
 * account outside the Household, 201 otherwise.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 })
  }
  const parsed = parseBody(body)
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const ctx = await requireHousehold()
  const accounts = await ctx.repo.accounts.list()
  if (!accounts.some((a) => a.id === parsed.accountId)) {
    return NextResponse.json({ error: "unknown account" }, { status: 400 })
  }

  const txn = await ctx.repo.transactions.createManual(parsed)
  await recordActivity(ctx, ActivityAction.TransactionCreated, {
    transactionId: txn.id,
    merchant: parsed.merchant,
    amount: parsed.amount,
  })
  return NextResponse.json(txn, { status: 201 })
}
