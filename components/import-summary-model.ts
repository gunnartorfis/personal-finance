import type { ImportSummary, RecoveredOutcome } from "./import-summary"

/**
 * Pure reducers for the post-import outcome (ADR-0025), kept out of the component file so the form
 * stays thin: fold a Fix & import / Import anyway result into the summary, moving the row out of its
 * withheld bucket and into `added` (or `already imported`, if a Fix & import turned out to dedup).
 */

export function applyRecovered(
  summary: ImportSummary,
  sourceRow: number,
  outcome: RecoveredOutcome,
): ImportSummary {
  return {
    ...summary,
    added: summary.added + outcome.appended,
    alreadyImported: summary.alreadyImported + outcome.duplicates,
    couldntRead: summary.couldntRead.filter((row) => row.sourceRow !== sourceRow),
    couldntReadTotal: Math.max(0, summary.couldntReadTotal - 1),
  }
}

export function applyForced(
  summary: ImportSummary,
  sourceRow: number,
  outcome: RecoveredOutcome,
): ImportSummary {
  return {
    ...summary,
    added: summary.added + outcome.appended,
    alreadyImported: Math.max(0, summary.alreadyImported - outcome.appended),
    alreadyImportedRows: summary.alreadyImportedRows.filter((row) => row.sourceRow !== sourceRow),
  }
}
