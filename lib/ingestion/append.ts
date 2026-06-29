import type { HouseholdRepo } from "@/lib/db/household-repo";
import { partitionNewRows, type FingerprintInput } from "@/shared/dedup";

import type { ParsedRow } from "./parse-csv";

/**
 * Append parsed rows to a Household's Transactions (ADR-0003), skipping duplicates via the
 * row-fingerprint dedup. New rows are inserted as `pending` (the schema default) for later
 * classification, carrying their `source_row` for traceability. The repo is household-scoped, and
 * the composite FKs ensure the Account/Upload belong to the same Household.
 */
export interface AppendResult {
  appended: number;
  duplicates: number;
}

export async function appendTransactions(
  repo: HouseholdRepo,
  input: { uploadId: string; accountId: string; rows: ParsedRow[] },
): Promise<AppendResult> {
  const stored = await repo.transactions.list();
  const existing: FingerprintInput[] = stored.map((t) => ({
    date: t.date,
    amount: t.amount,
    merchant: t.merchant,
    category: t.rawCategory,
  }));
  const incoming = input.rows.map((r) => ({ ...r, category: r.rawCategory }));

  const { fresh, duplicates } = partitionNewRows(existing, incoming);

  await repo.transactions.createMany(
    fresh.map((row) => ({
      accountId: input.accountId,
      uploadId: input.uploadId,
      date: row.date,
      amount: row.amount,
      merchant: row.merchant,
      rawCategory: row.rawCategory,
      sourceRow: row.sourceRow,
    })),
  );

  return { appended: fresh.length, duplicates: duplicates.length };
}
