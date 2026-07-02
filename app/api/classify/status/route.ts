import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";

import { freeCapStatus } from "@/lib/billing/free-cap-status";
import { requireHousehold } from "@/lib/household/current";

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
    const [pending, failed, classified] = await Promise.all([
      repo.transactions.countPending(),
      repo.transactions.countFailed(),
      repo.transactions.countClassified(),
    ]);
    const { paused } = freeCapStatus({ plan, classifiedCount: classified });
    return NextResponse.json({ pending, failed, paused });
  } catch (error) {
    // requireHousehold signals auth/tenant redirects via control-flow errors Next must catch.
    unstable_rethrow(error);
    console.error("GET /api/classify/status failed", error);
    return NextResponse.json({ error: "status_failed" }, { status: 500 });
  }
}
