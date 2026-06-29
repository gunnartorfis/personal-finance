import { NextResponse } from "next/server";

import { requireHousehold } from "@/lib/household/current";
import { createUpload } from "@/lib/ingestion/upload";

/**
 * POST /api/uploads — register a CSV upload for the current Household (ADR-0003). Multipart form:
 * `file` (the CSV) and `accountId`. Returns 201 with the Upload, or 409 if this exact file was
 * already imported.
 */
export async function POST(request: Request) {
  const { memberId, repo } = await requireHousehold();

  const form = await request.formData();
  const file = form.get("file");
  const accountId = form.get("accountId");
  if (!(file instanceof File) || typeof accountId !== "string") {
    return NextResponse.json({ error: "file and accountId are required" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await createUpload(repo, {
    accountId,
    fileName: file.name,
    bytes,
    importedByMemberId: memberId,
  });

  return NextResponse.json(result, { status: result.status === "duplicate" ? 409 : 201 });
}
