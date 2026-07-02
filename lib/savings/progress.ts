/** What the dashboard's compact Savings progress card renders (ADR-0007, Phase J). */
export interface SavingsProgress {
  target: number;
  /** Inferred saved to date: startingSaved + every frozen check-in from the start cycle on. */
  saved: number;
  /** Whole-number share of the target reached, clamped to 0–100 for the meter. */
  percent: number;
  currency: string;
}

/**
 * Fold the Savings goal + frozen Check-in history into the dashboard progress card's numbers.
 * Pure so it unit-tests directly — the page passes `repo.savings.goal.get()` and
 * `repo.savings.checkins.list()` straight in. `null` (no goal) hides the card entirely.
 * Check-ins from before the goal's start cycle (an earlier goal's history) don't count.
 */
export function buildSavingsProgress(
  goal:
    | { target: number; startingSaved: number; startCycle: string; currency: string }
    | undefined,
  checkins: ReadonlyArray<{ cycleKey: string; inferredSaving: number }>,
): SavingsProgress | null {
  if (!goal) return null;
  let saved = goal.startingSaved;
  for (const checkin of checkins) {
    if (checkin.cycleKey >= goal.startCycle) saved += checkin.inferredSaving;
  }
  const percent = Math.min(100, Math.max(0, Math.round((saved / goal.target) * 100)));
  return { target: goal.target, saved, percent, currency: goal.currency };
}
