import type { HouseholdRepo } from "@/lib/db/household-repo";

/** One Activity log entry as read for the member-facing log (ADR-0017). */
export type ActivityLogEntry = Awaited<ReturnType<HouseholdRepo["activity"]["list"]>>[number];

/**
 * Load the current Household's Activity log for display (ADR-0017): the whole log, newest-first.
 * Thin, repo-scoped, and side-effect-free so the Settings page stays a pure read — every Member
 * sees the same entries (transparency). No pagination in v1.
 */
export async function loadActivityLog(
  repo: Pick<HouseholdRepo, "activity">,
): Promise<ActivityLogEntry[]> {
  return repo.activity.list();
}
