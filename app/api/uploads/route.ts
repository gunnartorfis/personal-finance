import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { requireHousehold } from "@/lib/household/current";
import { parseStatementCsv, type ParsedRow } from "@/lib/ingestion/parse-csv";
import { ingestUpload } from "@/lib/ingestion/upload";

/** Upper bound on a single CSV upload; statements are small, so this is generous headroom. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/uploads — ingest a CSV upload for the current Household (ADR-0003). Multipart form:
 * `file` (the CSV) and `accountId`. The Upload and its parsed rows are written atomically. Returns
 * 201 with counts, 409 if this exact file was already imported, 404 for an unknown account, 413 if
 * it exceeds the size limit, 422 if the CSV can't be parsed.
 */
export async function POST(request: Request) {
  const { memberId, householdId } = await requireHousehold();

  const form = await request.formData();
  const file = form.get("file");
  const accountId = form.get("accountId");
  if (!(file instanceof File) || typeof accountId !== "string" || !UUID_RE.test(accountId)) {
    return NextResponse.json({ error: "file and a valid accountId are required" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    // Bound memory before buffering the whole file into a Uint8Array.
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Parse first so a malformed CSV is rejected before anything is written.
  let rows: ParsedRow[];
  try {
    rows = parseStatementCsv(new TextDecoder().decode(bytes));
  } catch {
    return NextResponse.json({ error: "could not parse CSV" }, { status: 422 });
  }

  const result = await ingestUpload(getDb(), householdId, {
    accountId,
    fileName: file.name,
    bytes,
    importedByMemberId: memberId,
    rows,
  });

  const status =
    result.status === "duplicate" ? 409 : result.status === "unknown-account" ? 404 : 201;
  return NextResponse.json(result, { status });
}
