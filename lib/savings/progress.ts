/** What the dashboard's compact Savings progress card renders (ADR-0007, Phase J). */
export interface SavingsProgress {
  target: number;
  /** Inferred saved to date: startingSaved + every elapsed cycle's inferred saving. */
  saved: number;
  /** Whole-number share of the target reached, clamped to 0–100 for the meter. */
  percent: number;
  currency: string;
}

/**
 * Fold the Savings goal + each elapsed cycle's inferred saving into the progress card's numbers.
 * Pure so it unit-tests directly: the caller derives `cycleSavings` (one entry per cycle from the
 * goal's start cycle through the current cycle) from the config + spend, so no cycle here needs
 * filtering. `undefined` goal (none set) hides the card entirely.
 */
export function buildSavingsProgress(
  goal: { target: number; startingSaved: number; currency: string } | undefined,
  cycleSavings: ReadonlyArray<number>,
): SavingsProgress | null {
  if (!goal) return null;
  let saved = goal.startingSaved;
  for (const saving of cycleSavings) saved += saving;
  const percent = Math.min(100, Math.max(0, Math.round((saved / goal.target) * 100)));
  return { target: goal.target, saved, percent, currency: goal.currency };
}
