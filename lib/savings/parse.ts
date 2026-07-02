import { isValidCycleKey } from "@/lib/dashboard/cycle";
import type { savingsGoals } from "@/lib/db/schema";

/** The Savings config lists a household replaces in one save (ADR-0007). */
export interface SavingsConfigInput {
  incomeSources: Array<{ name: string; amount: number }>;
  offcardCosts: Array<{ name: string; monthlyAmount: number }>;
}

export type ConfigParseResult =
  | { ok: true; value: SavingsConfigInput }
  | { ok: false; error: string };

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

/** Validate one named-amount entry; returns the trimmed name + integer amount, or an error. */
function parseEntry(
  entry: unknown,
  amountKey: "amount" | "monthlyAmount",
  label: string,
): { ok: true; name: string; amount: number } | { ok: false; error: string } {
  if (typeof entry !== "object" || entry === null) {
    return { ok: false, error: `each ${label} must be an object` };
  }
  const record = entry as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name === "") {
    return { ok: false, error: `each ${label} needs a non-empty name` };
  }
  const amount = record[amountKey];
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) {
    return { ok: false, error: `${label} ${amountKey} must be a non-negative integer` };
  }
  return { ok: true, name, amount };
}

/**
 * Validate a Savings-config PUT body (ADR-0007): the full income-source and off-card-cost lists,
 * replaced together in one save. Mirrors the DB CHECK constraints (non-negative integer amounts);
 * names are trimmed and must be non-empty. Empty lists are valid — they clear the config.
 */
export function parseSavingsConfigInput(body: unknown): ConfigParseResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "expected a JSON object" };
  }
  const input = body as Record<string, unknown>;
  if (!Array.isArray(input.incomeSources) || !Array.isArray(input.offcardCosts)) {
    return { ok: false, error: "incomeSources and offcardCosts must both be arrays" };
  }

  const incomeSources = [];
  for (const entry of input.incomeSources) {
    const parsed = parseEntry(entry, "amount", "income source");
    if (!parsed.ok) return parsed;
    incomeSources.push({ name: parsed.name, amount: parsed.amount });
  }

  const offcardCosts = [];
  for (const entry of input.offcardCosts) {
    const parsed = parseEntry(entry, "monthlyAmount", "off-card cost");
    if (!parsed.ok) return parsed;
    offcardCosts.push({ name: parsed.name, monthlyAmount: parsed.amount });
  }

  return { ok: true, value: { incomeSources, offcardCosts } };
}
