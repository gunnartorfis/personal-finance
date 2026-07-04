import { isValidCycleKey } from "@/lib/dashboard/cycle";
import type { savingsGoals } from "@/lib/db/schema";

/** The Savings config lists a household replaces in one save (ADR-0007, extended by ADR-0015). */
export interface SavingsConfigInput {
  incomeSources: Array<{ name: string; amount: number; effectiveFrom: string }>;
  offcardCosts: Array<{ name: string; monthlyAmount: number; effectiveFrom: string }>;
  /**
   * Per-cycle One-off adjustments (ADR-0015). `undefined` when the body omits the key entirely —
   * the caller then leaves existing one-offs untouched; an empty array clears them.
   */
  oneOffAdjustments?: Array<{
    cycleKey: string;
    kind: "income" | "cost";
    amount: number;
    label?: string;
  }>;
}

/** One validated One-off adjustment (ADR-0015). */
type OneOffInput = NonNullable<SavingsConfigInput["oneOffAdjustments"]>[number];

/** The floor sentinel effective cycle — a baseline in force from the start (ADR-0015). */
const EFFECTIVE_FROM_FLOOR = "0001-01";

export type ConfigParseResult =
  | { ok: true; value: SavingsConfigInput }
  | { ok: false; error: string };

/** A Savings goal ready to upsert (the household is stamped by the repo). */
export type NewSavingsGoal = Omit<typeof savingsGoals.$inferInsert, "householdId">;

export type GoalParseResult = { ok: true; value: NewSavingsGoal } | { ok: false; error: string };

const ISO_DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

/** Whether `value` (already `YYYY-MM-DD`-shaped) is a real calendar date — no Feb 31. */
function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

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

  if (
    typeof input.targetDate !== "string" ||
    !ISO_DATE_RE.test(input.targetDate) ||
    !isCalendarDate(input.targetDate)
  ) {
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

  // Optional display name (chrome, not math). Trimmed; whitespace-only or absent (`null`/omitted)
  // collapses to `null` so a GET→PUT round-trip of an unnamed goal doesn't 400 and editing can
  // clear it. Capped at 60 chars to mirror the DB length check.
  let title: string | null = null;
  if (input.title !== undefined && input.title !== null) {
    if (typeof input.title !== "string") {
      return { ok: false, error: "title must be a string" };
    }
    const trimmed = input.title.trim();
    if (trimmed.length > 60) {
      return { ok: false, error: "title must be 60 characters or fewer" };
    }
    if (trimmed !== "") title = trimmed;
  }

  return {
    ok: true,
    value: {
      title,
      target: input.target,
      targetDate: input.targetDate,
      startingSaved,
      startCycle: input.startCycle,
      currency,
    },
  };
}

/**
 * Validate one named-amount entry; returns the trimmed name, integer amount, and Effective cycle
 * (ADR-0015 — defaults to the floor sentinel when omitted, so a client that doesn't send dates gets
 * the baseline), or an error. Mirrors the DB CHECKs (non-negative amount, well-formed cycle key).
 */
function parseEntry(
  entry: unknown,
  amountKey: "amount" | "monthlyAmount",
  label: string,
):
  | { ok: true; name: string; amount: number; effectiveFrom: string }
  | { ok: false; error: string } {
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
  const effectiveFrom = record.effectiveFrom === undefined ? EFFECTIVE_FROM_FLOOR : record.effectiveFrom;
  if (typeof effectiveFrom !== "string" || !isValidCycleKey(effectiveFrom)) {
    return { ok: false, error: `${label} effectiveFrom must be a YYYY-MM cycle key` };
  }
  return { ok: true, name, amount, effectiveFrom };
}

/** Validate one One-off adjustment entry (ADR-0015); mirrors the DB CHECKs + enum. */
function parseOneOff(
  entry: unknown,
): { ok: true; value: OneOffInput } | { ok: false; error: string } {
  if (typeof entry !== "object" || entry === null) {
    return { ok: false, error: "each one-off adjustment must be an object" };
  }
  const record = entry as Record<string, unknown>;
  if (typeof record.cycleKey !== "string" || !isValidCycleKey(record.cycleKey)) {
    return { ok: false, error: "one-off adjustment cycleKey must be a YYYY-MM cycle key" };
  }
  if (record.kind !== "income" && record.kind !== "cost") {
    return { ok: false, error: "one-off adjustment kind must be 'income' or 'cost'" };
  }
  if (typeof record.amount !== "number" || !Number.isInteger(record.amount) || record.amount < 0) {
    return { ok: false, error: "one-off adjustment amount must be a non-negative integer" };
  }
  // `null` is treated as absent (SQL-null semantics), so a GET response — which serializes a missing
  // label as `label: null` — round-trips back through PUT without a spurious 400.
  if (record.label !== undefined && record.label !== null && typeof record.label !== "string") {
    return { ok: false, error: "one-off adjustment label must be a string" };
  }
  const label = typeof record.label === "string" ? record.label.trim() : "";
  return {
    ok: true,
    value: {
      cycleKey: record.cycleKey,
      kind: record.kind,
      amount: record.amount,
      ...(label === "" ? {} : { label }),
    },
  };
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
    incomeSources.push({ name: parsed.name, amount: parsed.amount, effectiveFrom: parsed.effectiveFrom });
  }

  const offcardCosts = [];
  for (const entry of input.offcardCosts) {
    const parsed = parseEntry(entry, "monthlyAmount", "off-card cost");
    if (!parsed.ok) return parsed;
    offcardCosts.push({
      name: parsed.name,
      monthlyAmount: parsed.amount,
      effectiveFrom: parsed.effectiveFrom,
    });
  }

  // One-offs are optional: omit the key to leave existing ones untouched (the repo's replaceConfig
  // does the same); an empty array clears them. A present-but-non-array value is a bad request.
  let oneOffAdjustments: OneOffInput[] | undefined;
  if (input.oneOffAdjustments !== undefined) {
    if (!Array.isArray(input.oneOffAdjustments)) {
      return { ok: false, error: "oneOffAdjustments must be an array" };
    }
    oneOffAdjustments = [];
    for (const entry of input.oneOffAdjustments) {
      const parsed = parseOneOff(entry);
      if (!parsed.ok) return parsed;
      oneOffAdjustments.push(parsed.value);
    }
  }

  return { ok: true, value: { incomeSources, offcardCosts, oneOffAdjustments } };
}
