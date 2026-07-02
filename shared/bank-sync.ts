import type { Plan } from "./types";

/**
 * Bank auto-sync (open banking, Phase K) is a Premium feature — a Free household stays CSV-only and
 * sees an upgrade prompt instead of the connect entry (#117). Shared by the server gate on the
 * connect route and the client `BankSyncGate` so the rule lives in one place.
 */
export function canUseBankSync(plan: Plan): boolean {
  return plan === "Premium";
}
