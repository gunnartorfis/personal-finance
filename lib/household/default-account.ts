/**
 * Every Household owns exactly one default account (ADR-0004): the account its uploads attach to
 * before it has added any of its own, and the pre-selected pick in the upload flow. It is created
 * with the Household (see `provision.ts`), re-created after a data reset (see `reset.ts`), and
 * backfilled onto pre-existing Households by the migration that added `accounts.is_default`.
 *
 * The migration hardcodes this same name in SQL, so keep the two in sync if it ever changes.
 */
export const DEFAULT_ACCOUNT_NAME = "Main account";
