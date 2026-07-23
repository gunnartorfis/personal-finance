import type { HouseholdRepo } from "@/lib/db/household-repo";
import { partitionNewRows, type FingerprintInput } from "@/shared/dedup";

import {
  buildAlreadyImported,
  type AlreadyImportedRow,
  type StoredForProvenance,
} from "./import-outcome";
import type { ParsedRow } from "./parse-csv";

/**
 * Append parsed rows to a Household's Transactions (ADR-0003), skipping duplicates via the
 * row-fingerprint dedup. Dedup is scoped to the Account (the card), since two different Accounts
 * can legitimately have identical `(date, amount, merchant, category)` rows. New rows are inserted
 * as `pending` (the schema default) for later classification, carrying their `source_row` for
 * traceability. The repo is household-scoped, and the composite FKs ensure the Account/Upload
 * belong to the same Household.
 */
export interface AppendResult {
  appended: number;
  duplicates: number;
  /** The deduped rows with provenance (ADR-0025), capped — for the "already imported" bucket. */
  alreadyImported: AlreadyImportedRow[];
}

export async function appendTransactions(
  repo: HouseholdRepo,
  input: { uploadId: string; accountId: string; rows: ParsedRow[] },
): Promise<AppendResult> {
  const stored = await repo.transactions.listByAccount(input.accountId);
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

  // Provenance for the duplicates: pair each with the earliest Upload that already holds its
  // fingerprint (ADR-0025), so the summary can show when/where it first came in.
  const uploadsById = new Map((await repo.uploads.list()).map((u) => [u.id, u]));
  const storedForProvenance: StoredForProvenance[] = stored.map((t) => {
    const up = t.uploadId ? uploadsById.get(t.uploadId) : undefined;
    return {
      date: t.date,
      amount: t.amount,
      merchant: t.merchant,
      category: t.rawCategory,
      importedAt: up ? new Date(up.createdAt).toISOString() : null,
      fileName: up ? up.fileName : null,
    };
  });
  const { alreadyImported } = buildAlreadyImported(duplicates, storedForProvenance);

  return { appended: fresh.length, duplicates: duplicates.length, alreadyImported };
}
