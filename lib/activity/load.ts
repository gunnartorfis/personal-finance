import type { HouseholdRepo } from "@/lib/db/household-repo";

/** One Activity log entry as read for the member-facing log (ADR-0017). */
export type ActivityLogEntry = Awaited<ReturnType<HouseholdRepo["activity"]["list"]>>[number];

/**
 * How many entries the member-facing log shows. Bounds the read so the page can't fetch an
 * ever-growing history in one query; v1 has no pagination, so this is the (generous) ceiling —
 * the most recent {@link ACTIVITY_LOG_LIMIT} actions, newest-first.
 */
export const ACTIVITY_LOG_LIMIT = 250;

/**
 * Load the current Household's Activity log for display (ADR-0017): the most recent entries,
 * newest-first. Thin, repo-scoped, and side-effect-free so the Settings page stays a pure read —
 * every Member sees the same entries (transparency).
 */
export async function loadActivityLog(
  repo: Pick<HouseholdRepo, "activity">,
  limit: number = ACTIVITY_LOG_LIMIT,
): Promise<ActivityLogEntry[]> {
  return repo.activity.list(limit);
}
