/**
 * Availability of the destructive "reset my household data" tool.
 *
 * The reset wipes a Household's entire financial dataset (see `lib/household/reset.ts`). The single
 * source of truth for whether it is exposed is the `ENABLE_HOUSEHOLD_RESET` env var: set it (to `1`
 * or `true`) only in the environments that should have the tool — the staging/preview environment,
 * and never production. There is no deployment-type backstop, so the wipe is reachable anywhere the
 * flag is set; treat production as off-limits when configuring the env.
 *
 * Kept side-effect-free (reads env only) so it is trivially unit-testable, like `lib/auth/env.ts`.
 */

/** Whether the value of an on/off env var reads as enabled. */
function isTruthy(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

/** True when the environment has explicitly opted into the household reset tool. */
export function isHouseholdResetEnabled(): boolean {
  return isTruthy(process.env.ENABLE_HOUSEHOLD_RESET);
}
