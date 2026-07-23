import { NextResponse } from "next/server";

import { ActivityAction } from "@/lib/activity/actions";
import { recordActivity } from "@/lib/activity/record";
import { requireHousehold } from "@/lib/household/current";
import { appendTransactions } from "@/lib/ingestion/append";
import type { ParsedRow } from "@/lib/ingestion/parse-csv";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FIELD = 200;

/**
 * POST /api/uploads/:id/rows — recover a row the CSV parser couldn't read (ADR-0025). The Member
 * supplies the corrected `date` (YYYY-MM-DD), `amount` (integer in the billing currency, negative =
 * expense), `merchant`, and optional `category`; the row is appended to that Upload through the
 * normal dedup path (so a fixed row that turns out to already exist is reported as a duplicate, not
 * a second copy), and the recovery is written to the Activity log (ADR-0017). 400 on invalid input,
 * 404 for an unknown upload, 201 with the append outcome otherwise.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid upload id" }, { status: 400 });
  }

  const ctx = await requireHousehold();
  const upload = await ctx.repo.uploads.findById(id);
  if (!upload) {
    return NextResponse.json({ error: "upload not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const { date, amount, merchant } = body ?? {};
  const category = body?.category ?? "";
  const sourceRow = body?.sourceRow;
  if (
    typeof date !== "string" ||
    !ISO_DATE_RE.test(date) ||
    typeof amount !== "number" ||
    !Number.isInteger(amount) ||
    typeof merchant !== "string" ||
    merchant.trim().length === 0 ||
    typeof category !== "string"
  ) {
    return NextResponse.json({ error: "invalid row" }, { status: 400 });
  }

  const row: ParsedRow = {
    sourceRow: typeof sourceRow === "number" && Number.isInteger(sourceRow) ? sourceRow : 0,
    date,
    amount,
    merchant: merchant.trim().slice(0, MAX_FIELD),
    rawCategory: category.trim().slice(0, MAX_FIELD),
  };

  // Append through the normal dedup path, scoped to the Upload's own account (never trust a
  // client-supplied account): a fixed row that already exists comes back as a duplicate.
  const result = await appendTransactions(ctx.repo, {
    uploadId: id,
    accountId: upload.accountId,
    rows: [row],
  });

  await recordActivity(ctx, ActivityAction.UploadRowsRecovered, {
    uploadId: id,
    appended: result.appended,
    duplicates: result.duplicates,
  });

  return NextResponse.json(result, { status: 201 });
}
