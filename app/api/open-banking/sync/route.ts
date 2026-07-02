import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { sonnetClassifier } from "@/lib/classification/sonnet-classifier";
import { getDb } from "@/lib/db";
import { requireHousehold } from "@/lib/household/current";
import { syncDueConnections, syncHousehold } from "@/lib/open-banking/cron-sync";
import { getIngestionProvider } from "@/lib/open-banking/provider-factory";
import { canUseBankSync } from "@/shared/bank-sync";

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

// Vercel Cron issues GET, guarded by the cron secret (system-wide, every household).
export { handle as GET };

/**
 * On-link initial sync (#146): pull a freshly-linked bank's transactions immediately instead of
 * making the user wait for the next daily cron. Session-authed and scoped to the caller's own
 * household via `requireHousehold` — a different trust boundary than the secret-gated GET, so it's
 * safe to expose. Client-triggered after the connect redirect lands on /accounts?bank=connected.
 * Idempotent: same dedup + `lastSyncedAt` path as the cron, so a double-fire (e.g. refresh) inserts
 * nothing new. Bank sync is Premium-only (#117) — a Free household has no active connections, but the
 * gate is enforced here regardless as the trust boundary.
 */
async function postHandler(): Promise<Response> {
  const { householdId, plan } = await requireHousehold();
  if (!canUseBankSync(plan)) {
    return NextResponse.json({ error: "upgrade_required" }, { status: 403 });
  }

  const result = await syncHousehold({
    db: getDb(),
    householdId,
    plan,
    provider: getIngestionProvider(),
    now: new Date(),
    classifier: sonnetClassifier(),
  });

  return NextResponse.json(result);
}

export { postHandler as POST };
