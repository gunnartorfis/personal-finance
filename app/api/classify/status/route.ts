import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";

import { requireHousehold } from "@/lib/household/current";
import { isClassificationPaused } from "@/shared/free-cap";

/**
 * GET /api/classify/status — household-wide classification backlog (ADR-0005). Unlike the
 * per-upload progress route, this counts every pending/failed row across the Household so a global
 * banner can surface "N awaiting classification" on any page, including after a refresh that killed
 * the browser-driven drain loop. `paused` mirrors the Free-cap gate the dashboard's ActionBand uses
 * to hide the pending affordance (a capped drain would skip every expense row anyway).
 */
export async function GET() {
  try {
    const { plan, repo } = await requireHousehold();
    // Only a Free household can be paused, and only then is the classified count needed — skip that
    // count entirely for Premium (uncapped) so the common case is two counts, not three, per poll.
    const capped = plan !== "Premium";
    const [pending, failed, classified] = await Promise.all([
      repo.transactions.countPending(),
      repo.transactions.countFailed(),
      capped ? repo.transactions.countClassified() : Promise.resolve(0),
    ]);
    const paused = capped && isClassificationPaused(plan, classified);
    return NextResponse.json({ pending, failed, paused });
  } catch (error) {
    // requireHousehold signals auth/tenant redirects via control-flow errors Next must catch.
    unstable_rethrow(error);
    console.error("GET /api/classify/status failed", error);
    return NextResponse.json({ error: "status_failed" }, { status: 500 });
  }
}
