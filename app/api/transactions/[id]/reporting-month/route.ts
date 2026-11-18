import { NextResponse } from "next/server"

import { ActivityAction } from "@/lib/activity/actions"
import { recordActivity } from "@/lib/activity/record"
import { isValidCycleKey } from "@/lib/dashboard/cycle"
import { requireHousehold } from "@/lib/household/current"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Assign a reporting month or pass null to use the original transaction date. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid_transaction_id" }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const month: unknown = body?.month
  if (month !== null && (typeof month !== "string" || !isValidCycleKey(month) || month.startsWith("0000"))) {
    return NextResponse.json({ error: "invalid_reporting_month" }, { status: 400 })
  }

  const ctx = await requireHousehold()
  const transaction = await ctx.repo.transactions.findById(id)
  if (!transaction || transaction.archived || transaction.deletedAt) {
    return NextResponse.json({ error: "transaction_not_found" }, { status: 404 })
  }

  const [updated] = await ctx.repo.transactions.setReportingMonth(id, month)
  if (!updated) {
    return NextResponse.json({ error: "transaction_not_found" }, { status: 404 })
  }

  const destination = (updated.reportingMonth ?? updated.date).slice(0, 7)
  if (updated.reportingMonth !== transaction.reportingMonth) {
    await recordActivity(ctx, ActivityAction.TransactionReportingMonthChanged, {
      transactionId: id,
      merchant: transaction.merchant,
      fromMonth: (transaction.reportingMonth ?? transaction.date).slice(0, 7),
      toMonth: destination,
    })
  }
  return NextResponse.json({ month: destination })
}
