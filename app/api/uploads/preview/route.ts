import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { requireHousehold } from "@/lib/household/current";
import { previewUpload } from "@/lib/ingestion/preview";
import { RowCapExceededError } from "@/lib/ingestion/parse-csv";

/** Upper bound on a single CSV upload; matches the commit route's limit. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/uploads/preview — dry-run of a CSV upload for the current Household (ADR-0018). Multipart
 * form: `file` (the CSV) and `accountId`. Detects the column mapping and, if complete, reports new
 * vs. duplicate row counts — writing nothing. Returns 200 with the preview, 404 for an unknown
 * account, 413 if it exceeds the size limit, 400 for bad input, 422 if the CSV can't be read at all.
 */
export async function POST(request: Request) {
  const { householdId } = await requireHousehold();

  const form = await request.formData();
  const file = form.get("file");
  const accountId = form.get("accountId");
  if (!(file instanceof File) || typeof accountId !== "string" || !UUID_RE.test(accountId)) {
    return NextResponse.json({ error: "file and a valid accountId are required" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  let preview;
  try {
    preview = await previewUpload(getDb(), householdId, { accountId, bytes });
  } catch (err) {
    // A too-large file is a distinct, actionable condition — report it as such, not "unreadable".
    if (err instanceof RowCapExceededError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json({ error: "could not read CSV" }, { status: 422 });
  }

  const status = preview.status === "unknown-account" ? 404 : 200;
  return NextResponse.json(preview, { status });
}
