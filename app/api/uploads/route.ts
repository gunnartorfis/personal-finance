import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { householdRepo } from "@/lib/db/household-repo";
import { requireHousehold } from "@/lib/household/current";
import {
  headerSignature,
  parseColumnMappingJson,
  type ColumnMapping,
} from "@/lib/ingestion/column-mapping";
import { summarizeWithheld } from "@/lib/ingestion/import-outcome";
import {
  parseWithMappingAndHeader,
  RowCapExceededError,
  type ParsedRow,
  type WithheldRow,
} from "@/lib/ingestion/parse-csv";
import { resolveUpload } from "@/lib/ingestion/resolve-mapping";
import { ingestUpload } from "@/lib/ingestion/upload";

/** Upper bound on a single CSV upload; statements are small, so this is generous headroom. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/uploads — ingest a CSV upload for the current Household (ADR-0003, ADR-0018). Multipart
 * form: `file` (the CSV), `accountId`, and an optional `mapping` (JSON `{date,amount,merchant,
 * category}` column indices, from a confirmed preview) — when present the file is parsed with that
 * explicit mapping, otherwise columns are auto-detected. The Upload and its parsed rows are written
 * atomically. Returns 201 with counts on a fresh import; 200 (a no-op) when this exact file was
 * already imported — demoted from the old 409, since the row-fingerprint dedup is the real guard and
 * a re-upload inserts nothing anyway; 404 for an unknown account; 413 if it exceeds the size limit;
 * 400 for bad input; 422 if the CSV can't be parsed or has too many rows.
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

  // A confirmed preview may supply an explicit column mapping; validate it before any work.
  const mappingRaw = form.get("mapping");
  let mapping: ColumnMapping | undefined;
  if (typeof mappingRaw === "string" && mappingRaw.length > 0) {
    try {
      mapping = parseColumnMappingJson(mappingRaw);
    } catch {
      return NextResponse.json({ error: "invalid mapping" }, { status: 400 });
    }
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Parse first so a malformed CSV is rejected before anything is written.
  //  - explicit mapping (user confirmed/corrected it): parse deterministically and remember it,
  //    keyed by the file's header signature, so the same shape imports silently next time;
  //  - otherwise resolve remembered → heuristic (shared with the preview). A file neither the
  //    heuristics nor a remembered mapping can resolve is a 422 — the user must map it via preview.
  let rows: ParsedRow[];
  let withheld: WithheldRow[] = [];
  let effectiveMapping: ColumnMapping | undefined;
  let rememberMapping: { headerSignature: string; columns: ColumnMapping } | undefined;
  try {
    const text = new TextDecoder().decode(bytes);
    if (mapping) {
      const parsed = parseWithMappingAndHeader(text, mapping);
      rows = parsed.rows;
      withheld = parsed.withheld;
      effectiveMapping = mapping;
      rememberMapping = { headerSignature: headerSignature(parsed.header), columns: mapping };
    } else {
      const resolved = await resolveUpload(householdRepo(getDb(), householdId).columnMappings, text);
      if (resolved.unmatchedRoles.length > 0) {
        return NextResponse.json({ error: "could not map CSV columns" }, { status: 422 });
      }
      rows = resolved.rows;
      withheld = resolved.withheld;
      effectiveMapping = resolved.mapping as ColumnMapping;
    }
  } catch (err) {
    if (err instanceof RowCapExceededError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json({ error: "could not parse CSV" }, { status: 422 });
  }

  const result = await ingestUpload(getDb(), householdId, {
    accountId,
    fileName: file.name,
    bytes,
    importedByMemberId: memberId,
    rows,
    rememberMapping,
  });

  // On a fresh import, report the rows we couldn't read alongside the counts (ADR-0025) so the UI
  // can surface and later recover them. effectiveMapping is always set on this success path.
  if (result.status === "created" && effectiveMapping) {
    const withheldSummary = summarizeWithheld(withheld, effectiveMapping);
    return NextResponse.json({ ...result, ...withheldSummary }, { status: 201 });
  }

  // "duplicate" is a successful no-op (the file was already imported), not an error — 200, not 409.
  const status = result.status === "unknown-account" ? 404 : 200;
  return NextResponse.json(result, { status });
}
