import { NextResponse } from "next/server";

import { sonnetClassifier } from "@/lib/classification/sonnet-classifier";
import { drainPending } from "@/lib/classification/worker";
import { requireHousehold } from "@/lib/household/current";

/** Pending transactions classified per request; the trigger is re-invoked until the queue drains. */
const BATCH = 25;

/**
 * POST /api/classify — drain a batch of the current Household's pending transactions through the
 * Sonnet 4.6 classifier (ADR-0005). Crash-safe and resumable via the idempotent status model, so
 * re-invoking (poll / cron) continues until the queue is empty. Returns the batch counts.
 *
 * (A fully durable Vercel Workflow orchestration is a future enhancement; batch-draining on the
 * idempotent queue gives the same resumability for v1.)
 */
export async function POST() {
  const { plan, repo } = await requireHousehold();
  const result = await drainPending(repo, sonnetClassifier(), { plan, limit: BATCH });
  return NextResponse.json(result);
}
