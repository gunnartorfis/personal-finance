/**
 * Availability of the destructive "reset my transaction data" developer tool.
 *
 * The reset wipes a Household's entire financial dataset (see `lib/household/reset.ts`), so it must
 * never be reachable in production. Two independent conditions gate it, both required:
 *
 *  1. `ENABLE_DEV_RESET` is explicitly opted in (set it in the staging environment only).
 *  2. The deployment is not production — `VERCEL_ENV` is `"production"` on prod, `"preview"` on
 *     preview deploys, `"development"` locally; unset (plain `next start`, tests) counts as non-prod.
 *
 * The production check is a hard backstop: even a stray `ENABLE_DEV_RESET=1` copied into the prod
 * environment cannot expose the wipe. Kept side-effect-free (reads env only) so it is trivially
 * unit-testable, like `lib/auth/env.ts`.
 */

/** Whether the value of an on/off env var reads as enabled. */
function isTruthy(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

/** True only on a non-production deployment that has explicitly opted into the dev reset tool. */
export function isDevResetEnabled(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  return isTruthy(process.env.ENABLE_DEV_RESET);
}
