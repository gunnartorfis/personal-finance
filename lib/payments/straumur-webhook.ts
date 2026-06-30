import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { straumurPayments } from "@/lib/db/schema";
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
  const [existing] = await db
    .select({ id: straumurPayments.id })
    .from(straumurPayments)
    .where(eq(straumurPayments.pspReference, args.pspReference));

  if (existing) {
    await db
      .update(straumurPayments)
      .set({
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
      })
      .where(eq(straumurPayments.id, existing.id));
    return;
  }

  await db.insert(straumurPayments).values(args);
}
