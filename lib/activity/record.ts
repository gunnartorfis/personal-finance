import type { HouseholdRepo } from "@/lib/db/household-repo";

import { resolveActorName, type ActorIdentity } from "./actor";

/**
 * The slice of a route's `requireHousehold()` context needed to attribute an Activity log entry:
 * the household-scoped repo, the acting member, and their identity (for the name snapshot).
 */
export interface ActivityContext {
  repo: Pick<HouseholdRepo, "activity">;
  memberId: string;
  user: ActorIdentity;
}

/**
 * Record one intent-level Activity log entry from a route (ADR-0017). Resolves the denormalized
 * actor-name snapshot from the signed-in user and stamps the acting member. Call this AFTER the
 * mutation it describes has succeeded, so the log reflects what actually happened.
 */
export async function recordActivity(
  ctx: ActivityContext,
  action: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  await ctx.repo.activity.record({
    memberId: ctx.memberId,
    actorName: resolveActorName(ctx.user),
    action,
    ...(payload === undefined ? {} : { payload }),
  });
}
