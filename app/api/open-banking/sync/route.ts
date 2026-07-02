import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { sonnetClassifier } from "@/lib/classification/sonnet-classifier";
import { getDb } from "@/lib/db";
import { syncDueConnections } from "@/lib/open-banking/cron-sync";
import { getIngestionProvider } from "@/lib/open-banking/provider-factory";

export const dynamic = "force-dynamic";
// Syncs every active connection and drains classification sequentially; give the batch headroom.
export const maxDuration = 300;

/** Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`; reject anything else (constant-time). */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  // Length check first: timingSafeEqual throws on a length mismatch.
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/**
 * Daily open-banking sync (#115), triggered by the Vercel cron (see vercel.json). For every
 * household with an active connection, pull new transactions incrementally and drain classification.
 * Per-connection failures flip that connection's status to `error` (surfaced by the reconnect UI)
 * without aborting the batch. The trust boundary is the cron secret — the same one the renewal cron
 * uses. Cron issues GET only.
 */
async function handle(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await syncDueConnections({
    db: getDb(),
    provider: getIngestionProvider(),
    now: new Date(),
    classifier: sonnetClassifier(),
  });

  return NextResponse.json(result);
}

// Vercel Cron only issues GET — don't expose POST as an out-of-schedule sync trigger.
export { handle as GET };
