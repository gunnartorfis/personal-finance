import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { isBillingPeriod, type BillingPeriod } from "@/lib/billing/pricing";
import { nextRenewal } from "@/lib/billing/renewal";
import { households, straumurPayments } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";

/** Works with the live Neon pool or pglite in tests. */
type Db = NodePgDatabase<typeof schema>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Recover the householdId we embedded in a subscription `merchantReference`
 * (`sub_{householdId}_{period}_{ts}_{rand}`). Returns null for any other shape — the row is still
 * recorded for diagnostics, just unlinked.
 */
export function parseHouseholdIdFromReference(reference: string | null | undefined): string | null {
  if (!reference) return null;
  const parts = reference.split("_");
  if (parts[0] !== "sub" || parts.length < 2) return null;
  return UUID_RE.test(parts[1]) ? parts[1] : null;
}

/** Recover the billing period from a subscription `merchantReference` (`sub_{hh}_{period}_…`). */
export function parsePeriodFromReference(
  reference: string | null | undefined,
): BillingPeriod | null {
  if (!reference) return null;
  const parts = reference.split("_");
  return parts[0] === "sub" && isBillingPeriod(parts[2]) ? parts[2] : null;
}

/** Best-effort extract of Adyen's recurring token from the webhook `additionalData`. */
export function extractRecurringDetailReference(
  additionalData: Record<string, unknown> | null | undefined,
): string | null {
  if (!additionalData) return null;
  const value =
    additionalData["recurring.recurringDetailReference"] ??
    additionalData["recurringDetailReference"];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export interface RecordWebhookArgs {
  pspReference: string;
  householdId: string | null;
  merchantReference: string | null;
  checkoutReference: string | null;
  recurringDetailReference: string | null;
  amount: number;
  currency: string;
  success: boolean;
  eventCode: string;
  reason: string | null;
  rawEvent: string | null;
}

/**
 * Idempotent upsert of a Straumur webhook event, keyed on `pspReference` — a re-delivered event
 * patches the existing row instead of inserting a duplicate (Straumur retries until it gets the
 * `[accepted]` ACK, so the same event can arrive more than once).
 */
export async function recordWebhookEvent(db: Db, args: RecordWebhookArgs): Promise<void> {
  // Atomic upsert: two concurrent deliveries of the same event (Straumur retries immediately if it
  // doesn't get the [accepted] ACK) can't race a select-then-insert into a unique violation.
  await db
    .insert(straumurPayments)
    .values(args)
    .onConflictDoUpdate({
      target: straumurPayments.pspReference,
      set: {
        householdId: args.householdId,
        merchantReference: args.merchantReference,
        checkoutReference: args.checkoutReference,
        recurringDetailReference: args.recurringDetailReference,
        amount: args.amount,
        currency: args.currency,
        success: args.success,
        eventCode: args.eventCode,
        reason: args.reason,
        rawEvent: args.rawEvent,
        receivedAt: new Date(),
      },
    });
}

/**
 * Activate Premium for a Household after a successful Authorization (ADR-0006): set the plan, the
 * next renewal date, and the stored card token. Idempotent — re-running is a harmless re-set. The
 * token is only written when present, so a later event missing it doesn't clear an earlier one.
 */
export async function activatePremiumFromAuthorization(
  db: Db,
  args: { householdId: string; period: BillingPeriod; recurringDetailReference: string | null; now: Date },
): Promise<void> {
  await db
    .update(households)
    .set({
      plan: "Premium",
      planRenewsAt: nextRenewal(args.now, args.period),
      ...(args.recurringDetailReference
        ? { straumurRecurringDetailReference: args.recurringDetailReference }
        : {}),
    })
    .where(eq(households.id, args.householdId));
}
