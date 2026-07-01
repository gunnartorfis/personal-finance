/**
 * Savings-goal math for a Household (ADR-0007).
 *
 * Progress toward a Savings goal is INFERRED from spend, never an entered balance: each Statement
 * cycle's saved amount is `Monthly income − Off-card fixed costs − card debits`, and only card
 * DEBITS count as spend — positive card lines (refunds, or a mistaken bank-account salary credit)
 * are ignored so they cannot inflate savings (ADR-0007). All amounts are in the Household's billing
 * currency (whole units); these functions are pure so they can be unit-tested directly, with the
 * database reads and Statement-cycle wiring living in the data-access / dashboard layers.
 */

/** A Household's Savings goal, reduced to the three numbers the math needs. */
export interface SavingsGoal {
  /** The amount to accumulate by the target date. */
  target: number;
  /** How much was already saved at the start cycle (0 if starting from scratch). */
  startingSaved: number;
  /** Whole Statement cycles from the start cycle through the target date; must be > 0. */
  totalCycles: number;
}

/**
 * The total magnitude of the card DEBITS in `amounts` (ADR-0007 debits-only): negative amounts
 * contribute their absolute value; zero and positive amounts (credits) are ignored.
 */
export function cardDebitsMagnitude(amounts: readonly number[]): number {
  let total = 0;
  for (const amount of amounts) {
    if (amount < 0) total -= amount;
  }
  return total;
}

/**
 * What a Household saved in one Statement cycle: `monthlyIncome − offCardFixed − cardDebits`.
 * Negative when the cycle spent more than it took in (a losing cycle).
 */
export function inferredSaving(input: {
  monthlyIncome: number;
  offCardFixed: number;
  cardDebits: number;
}): number {
  return input.monthlyIncome - input.offCardFixed - input.cardDebits;
}

/** Cumulative saved to date: the starting balance plus every recorded cycle's inferred saving. */
export function cumulativeSaved(startingSaved: number, cycleSavings: readonly number[]): number {
  let total = startingSaved;
  for (const saving of cycleSavings) total += saving;
  return total;
}

/**
 * The linear on-track reference: how much should be saved by `elapsedCycles`, spreading the amount
 * still to save (`target − startingSaved`) evenly across `totalCycles`. This is the FIXED baseline
 * used to judge on-track/behind; the forward corrective pace ({@link correctivePerCycle}) recomputes
 * separately. `elapsedCycles` is clamped into `[0, totalCycles]`. Throws {@link RangeError} if the
 * goal spans no cycles.
 */
export function requiredCumulativeByCycle(goal: SavingsGoal, elapsedCycles: number): number {
  if (goal.totalCycles <= 0) {
    throw new RangeError(`goal must span at least one cycle, got ${goal.totalCycles}`);
  }
  const elapsed = Math.min(Math.max(elapsedCycles, 0), goal.totalCycles);
  const perCycle = (goal.target - goal.startingSaved) / goal.totalCycles;
  return goal.startingSaved + perCycle * elapsed;
}

/** Whether cumulative saving meets or beats the linear requirement for `elapsedCycles`. */
export function isOnTrack(goal: SavingsGoal, elapsedCycles: number, cumulative: number): boolean {
  return cumulative >= requiredCumulativeByCycle(goal, elapsedCycles);
}

/**
 * The Required saving for the coming cycle: the amount still to save spread over the cycles that
 * remain, so it RISES when the Household is behind (fewer cycles, same shortfall). Never negative —
 * 0 once the target is met. When no cycles remain, the whole remaining amount is due at once.
 */
export function correctivePerCycle(
  goal: SavingsGoal,
  cumulative: number,
  cyclesRemaining: number,
): number {
  const remaining = Math.max(0, goal.target - cumulative);
  if (cyclesRemaining <= 0) return remaining;
  return remaining / cyclesRemaining;
}

/**
 * The Allowed nice-to-have budget for the coming cycle: what is left of income after off-card fixed
 * costs, the Required saving, and the expected `Fixed` + `Necessary` card spend. Negative when the
 * plan is over-committed — a signal that discretionary spend (or the goal) must be cut.
 */
export function allowedNiceToHave(input: {
  monthlyIncome: number;
  offCardFixed: number;
  requiredSaving: number;
  expectedFixed: number;
  expectedNecessary: number;
}): number {
  return (
    input.monthlyIncome -
    input.offCardFixed -
    input.requiredSaving -
    input.expectedFixed -
    input.expectedNecessary
  );
}
