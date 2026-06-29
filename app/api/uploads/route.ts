import { NextResponse } from "next/server";

import { requireHousehold } from "@/lib/household/current";
import { createUpload } from "@/lib/ingestion/upload";

/** Upper bound on a single CSV upload; statements are small, so this is generous headroom. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/uploads — register a CSV upload for the current Household (ADR-0003). Multipart form:
 * `file` (the CSV) and `accountId`. Returns 201 with the Upload, 409 if this exact file was
 * already imported, 413 if it exceeds the size limit.
 */
export async function POST(request: Request) {
  const { memberId, repo } = await requireHousehold();

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
  const result = await createUpload(repo, {
    accountId,
    fileName: file.name,
    bytes,
    importedByMemberId: memberId,
  });

  const status =
    result.status === "duplicate" ? 409 : result.status === "unknown-account" ? 404 : 201;
  return NextResponse.json(result, { status });
}
