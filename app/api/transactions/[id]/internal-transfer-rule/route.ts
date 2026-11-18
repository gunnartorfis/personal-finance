import { NextResponse } from "next/server";

import { cycleKeyRange } from "@/lib/dashboard/cycle";
import type { HouseholdRepo } from "@/lib/db/household-repo";
import { requireHousehold } from "@/lib/household/current";
import { knownCounterparties } from "@/lib/open-banking/account-identity";
import { getIngestionProvider } from "@/lib/open-banking/provider-factory";
import { canUseBankSync } from "@/shared/bank-sync";

type Context = { params: Promise<{ id: string }> };
type Transaction = NonNullable<Awaited<ReturnType<HouseholdRepo["transactions"]["findById"]>>>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readTransaction({ params }: Context) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return null;
  const { plan, repo } = await requireHousehold();
  const row = await repo.transactions.findById(id);
  if (row?.source !== "bank_sync" || row.archived || row.deletedAt) return null;
  return { row, plan, repo };
}

/** Older imports can recover IDs for this account and month from the bank's booked entries. */
async function recoverFingerprint(repo: HouseholdRepo, row: Transaction): Promise<string | null> {
  if (!row.externalId) return null;
  const account = await repo.accounts.findById(row.accountId);
  if (!account?.connectionId || !account.externalAccountId) return null;
  const connection = await repo.bankConnections.findById(account.connectionId);
  if (connection?.status !== "active") return null;

  const provider = getIngestionProvider();
  if (connection.provider !== provider.name) return null;
  const { from, to } = cycleKeyRange(row.date.slice(0, 7));
  const lastDay = new Date(Date.parse(to) - 86_400_000).toISOString().slice(0, 10);
  const through = new Date().toISOString().slice(0, 10);
  const entries = await provider.listTransactions(account.externalAccountId, {
    from,
    to: lastDay < through ? lastDay : through,
  });
  const fingerprints = knownCounterparties(entries);
  await repo.transactions.fillCounterpartyFingerprints(row.accountId, fingerprints);
  return (await repo.transactions.findById(row.id))?.counterpartyFingerprint ?? null;
}

/** Preview the rule and optionally enrich the selected month's older imports. */
export async function POST(_request: Request, context: Context) {
  const target = await readTransaction(context);
  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { row, repo, plan } = target;
  let fingerprint = row.counterpartyFingerprint;
  if (!fingerprint && canUseBankSync(plan)) {
    try {
      fingerprint = await recoverFingerprint(repo, row);
    } catch {
      return NextResponse.json({ error: "bank_unavailable" }, { status: 502 });
    }
  }
  if (!fingerprint) return NextResponse.json({ available: false });
  const rule = await repo.bankTransferRules.find(fingerprint);
  const historical = await repo.bankTransferRules.preview(fingerprint, rule ? undefined : row.id);
  return NextResponse.json({
    available: true,
    active: Boolean(rule),
    historical,
  });
}

export async function PUT(request: Request, context: Context) {
  const target = await readTransaction(context);
  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { row, repo } = target;
  if (!row.counterpartyFingerprint) {
    return NextResponse.json({ error: "identifier_unavailable" }, { status: 409 });
  }
  const body = await request.json().catch(() => null);
  if (typeof body?.includePast !== "boolean") {
    return NextResponse.json({ error: "invalid_scope" }, { status: 400 });
  }
  await repo.bankTransferRules.save(row.counterpartyFingerprint, row.id, body.includePast);
  return NextResponse.json({ active: true });
}

export async function DELETE(_request: Request, context: Context) {
  const target = await readTransaction(context);
  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { row, repo } = target;
  if (row.counterpartyFingerprint) await repo.bankTransferRules.remove(row.counterpartyFingerprint);
  return NextResponse.json({ active: false });
}
