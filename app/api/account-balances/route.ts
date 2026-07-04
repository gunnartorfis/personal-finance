import { NextResponse } from "next/server"

import { ActivityAction } from "@/lib/activity/actions"
import { recordActivity } from "@/lib/activity/record"
import { requireHousehold } from "@/lib/household/current"

/**
 * Account balance snapshots for the current Household (ADR-0016): `POST` records one snapshot per
 * supplied Account, the input for net worth and runway. Balances are whole billing-currency units and
 * may be negative (overdraft / card debt). Append-only — each POST inserts new rows, never updates.
 * Household-scoped via the repo; unknown Account ids are rejected so a snapshot can't attach to
 * another tenant's Account.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const entries = (body as { balances?: unknown } | null)?.balances
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "balances is required" }, { status: 400 })
  }

  // Normalise + validate every entry up front, so a bad row rejects the whole request rather than
  // inserting a partial set. Balances are rounded to whole units (ADR-0004); NaN/∞ are rejected.
  const parsed: Array<{ accountId: string; balance: number }> = []
  for (const entry of entries) {
    const accountId = (entry as { accountId?: unknown }).accountId
    const balance = (entry as { balance?: unknown }).balance
    if (typeof accountId !== "string" || typeof balance !== "number" || !Number.isFinite(balance)) {
      return NextResponse.json({ error: "invalid balance entry" }, { status: 400 })
    }
    parsed.push({ accountId, balance: Math.round(balance) })
  }

  const ctx = await requireHousehold()
  const { repo } = ctx
  // Only accept Account ids that belong to this Household — the DB FK would also reject a foreign id,
  // but validating here returns a clean 400 instead of surfacing a constraint error.
  const ownAccountIds = new Set((await repo.accounts.list()).map((account) => account.id))
  if (parsed.some((entry) => !ownAccountIds.has(entry.accountId))) {
    return NextResponse.json({ error: "unknown account" }, { status: 400 })
  }

  // One atomic multi-row insert, so a mid-batch failure can't leave net worth reflecting a partial
  // update (some Accounts' snapshots committed, others not).
  await repo.accounts.balances.insertMany(parsed)
  await recordActivity(ctx, ActivityAction.AccountBalanceRecorded, {
    count: parsed.length,
    balances: parsed,
  })
  return NextResponse.json({ ok: true }, { status: 201 })
}
