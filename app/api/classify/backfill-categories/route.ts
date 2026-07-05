import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";

import { backfillCategories } from "@/lib/classification/backfill-categories";
import { sonnetClassifier } from "@/lib/classification/sonnet-classifier";
import { requireHousehold } from "@/lib/household/current";

/** Candidates backfilled per request; the trigger is re-invoked until `scanned` is 0. */
const BATCH = 25;

/**
 * A batch is up to `BATCH` sequential Sonnet gateway calls (one per distinct merchant), so raise the
 * function timeout to the platform max, mirroring the classify drain.
 */
export const maxDuration = 300;

/**
 * POST /api/classify/backfill-categories — assign a Category to a batch of the current Household's
 * classified expense rows that have none (ADR-0020, S7). Free-cap-harmless: those rows already
 * counted as Classifications. Resumable — re-invoke (poll / cron) until `scanned` is 0. Returns the
 * batch counts (`scanned` / `backfilled` / `failed`).
 */
export async function POST() {
  try {
    const { repo } = await requireHousehold();
    const result = await backfillCategories(repo, sonnetClassifier(), { limit: BATCH });
    return NextResponse.json(result);
  } catch (error) {
    // requireHousehold issues redirect()/notFound() via control-flow errors Next must catch —
    // rethrow those untouched; convert only genuine infrastructure failures into a structured 500.
    unstable_rethrow(error);
    console.error("POST /api/classify/backfill-categories failed", error);
    return NextResponse.json({ error: "backfill_failed" }, { status: 500 });
  }
}
