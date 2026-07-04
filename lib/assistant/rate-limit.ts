import type { HouseholdRepo } from "@/lib/db/household-repo";

import { ASSISTANT_DAILY_MESSAGE_CAP } from "./config";

/** Midnight UTC of the calendar day containing `now` — the daily cap window boundary. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Whether the Household has hit its soft daily message cap for the current UTC day (#101). Counts
 * `user` messages only (assistant replies don't count); the route rejects a new message when true.
 */
export async function assistantDailyCapReached(
  repo: HouseholdRepo,
  now: Date,
  cap: number = ASSISTANT_DAILY_MESSAGE_CAP,
): Promise<boolean> {
  const used = await repo.assistant.countMessagesSince(startOfUtcDay(now));
  return used >= cap;
}
