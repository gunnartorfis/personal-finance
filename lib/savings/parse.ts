import { isValidCycleKey } from "@/lib/dashboard/cycle";
import type { savingsGoals } from "@/lib/db/schema";

/** A Savings goal ready to upsert (the household is stamped by the repo). */
export type NewSavingsGoal = Omit<typeof savingsGoals.$inferInsert, "householdId">;

export type GoalParseResult = { ok: true; value: NewSavingsGoal } | { ok: false; error: string };

const ISO_DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

/**
 * Validate a Savings-goal PUT body (ADR-0007), mirroring the DB CHECK constraints so a bad
 * request is a clean 400 rather than a constraint violation: positive integer `target`,
 * non-negative integer `startingSaved` (default 0), ISO `targetDate` strictly after the first
 * day of the `startCycle` month, well-formed cycle key, and a three-letter uppercase currency
 * (default ISK — the Household's billing currency, no FX in v1).
 */
export function parseSavingsGoalInput(body: unknown): GoalParseResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "expected a JSON object" };
  }
  const input = body as Record<string, unknown>;

  if (typeof input.target !== "number" || !Number.isInteger(input.target) || input.target <= 0) {
    return { ok: false, error: "target must be a positive integer" };
  }

  const startingSaved = input.startingSaved === undefined ? 0 : input.startingSaved;
  if (typeof startingSaved !== "number" || !Number.isInteger(startingSaved) || startingSaved < 0) {
    return { ok: false, error: "startingSaved must be a non-negative integer" };
  }

  if (typeof input.startCycle !== "string" || !isValidCycleKey(input.startCycle)) {
    return { ok: false, error: "startCycle must be a YYYY-MM cycle key" };
  }

  if (typeof input.targetDate !== "string" || !ISO_DATE_RE.test(input.targetDate)) {
    return { ok: false, error: "targetDate must be an ISO date (YYYY-MM-DD)" };
  }
  // Mirrors savings_goals_target_after_start_cycle: the goal must span at least part of a cycle.
  if (input.targetDate <= `${input.startCycle}-01`) {
    return { ok: false, error: "targetDate must be after the start cycle begins" };
  }

  const currency = input.currency === undefined ? "ISK" : input.currency;
  if (typeof currency !== "string" || !CURRENCY_RE.test(currency)) {
    return { ok: false, error: "currency must be a three-letter uppercase ISO code" };
  }

  return {
    ok: true,
    value: {
      target: input.target,
      targetDate: input.targetDate,
      startingSaved,
      startCycle: input.startCycle,
      currency,
    },
  };
}
