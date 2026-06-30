import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";

import { requireHousehold } from "@/lib/household/current";

/**
 * POST /api/classify/retry — requeue the current Household's `failed` transactions back to
 * `pending` so a subsequent `POST /api/classify` drain re-attempts them. Use once the cause of a
 * prior failure is resolved (e.g. AI Gateway credits topped up after a 403). Returns how many rows
 * were requeued; the client then drives the normal classify drain. Idempotent — re-posting with no
 * failed rows simply requeues zero.
 */
export async function POST() {
  try {
    const { repo } = await requireHousehold();
    const reset = await repo.transactions.resetFailed();
    return NextResponse.json({ reset: reset.length });
  } catch (error) {
    // requireHousehold issues redirect()/notFound() via control-flow errors Next must catch —
    // rethrow those and only convert genuine infrastructure failures into a structured 500.
    unstable_rethrow(error);
    console.error("POST /api/classify/retry failed", error);
    return NextResponse.json({ error: "retry_failed" }, { status: 500 });
  }
}
