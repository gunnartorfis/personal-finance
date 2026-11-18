import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";

import { sonnetClassifier } from "@/lib/classification/sonnet-classifier";
import { drainPending } from "@/lib/classification/worker";
import { cycleKeyRange, isValidCycleKey } from "@/lib/dashboard/cycle";
import { detectAndLinkTransfers } from "@/lib/transactions/link-transfers";
import { requireHousehold } from "@/lib/household/current";

/** Pending transactions classified per request; the trigger is re-invoked until the queue drains. */
const BATCH = 25;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A full batch is up to `BATCH` sequential Sonnet gateway calls, so raise the function timeout to
 * the platform max (300s ≈ 12s/call of headroom) — without this an in-flight batch can hit the
 * default timeout and return a 504 instead of the structured drain result the contract promises.
 */
export const maxDuration = 300;

/**
 * POST /api/classify — drain a batch of the current Household's pending transactions through the
 * Sonnet 5 classifier (ADR-0005). Crash-safe and resumable via the idempotent status model, so
 * re-invoking continues until the queue is empty. With `cycle=YYYY-MM`, rerun eligible expenses
 * in that cycle and follow the returned `nextCursor` via `after` to visit the remaining rows.
 */
export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  const cycle = params.get("cycle");
  const after = params.get("after");
  if (
    (cycle !== null && (!isValidCycleKey(cycle) || cycle.startsWith("0000"))) ||
    (after !== null && (cycle === null || !UUID_RE.test(after)))
  ) {
    return NextResponse.json({ error: "invalid_classification_scope" }, { status: 400 });
  }
  try {
    const { plan, repo } = await requireHousehold();
    const range = cycle ? cycleKeyRange(cycle) : undefined;
    if (range && !after) await detectAndLinkTransfers(repo, { bankOnly: true, range });
    const result = await drainPending(repo, sonnetClassifier(), {
      plan,
      limit: BATCH,
      rerun: range ? { range, after } : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    // requireHousehold issues redirect()/notFound() via control-flow errors that Next must catch —
    // rethrow those untouched, and only convert genuine infrastructure failures into a structured
    // 500 so cron/poll callers can distinguish a server error from a bad request or empty queue.
    unstable_rethrow(error);
    console.error(JSON.stringify({ event: "classification.request_failed" }));
    return NextResponse.json({ error: "classification_failed" }, { status: 500 });
  }
}
