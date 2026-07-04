# Cumulative saving counts only completed cycles

ADR-0007 derives Savings-goal progress from spend and deliberately **included the current
in-progress cycle**, flagged provisional. That overstates savings: mid-month a cycle carries the
full **Monthly income** against near-zero card debits, so on the 1st of a month **Inferred saving**
≈ the entire income. We now **exclude the current (in-progress) cycle** from cumulative saved,
`percent`, and the on-track comparison; only **completed** calendar months count. The current cycle
is instead the one being budgeted (its **Allowed nice-to-have**), shown in the by-cycle breakdown but
marked "not yet counted." This updates ADR-0007's "always includes the current month" stance (the
inference model itself is unchanged).

To keep the on-track judgment consistent, the elapsed-cycle count that drives
`requiredCumulativeByCycle` / `isOnTrack` also drops the current cycle — cumulative saved and the
required baseline are both measured through the last completed cycle. The current cycle therefore
becomes one of the *remaining* cycles, which is what `correctivePerCycle` / **Allowed nice-to-have**
already model as "the coming cycle."

## Considered Options

- **Pro-rate the current cycle's income** by days elapsed (`income × daysElapsed/daysInMonth −
  spendSoFar`). Keeps a live current-month number but spend is not uniform (rent lands on the 1st),
  so it still misleads early in the month. Rejected as more complex and still wrong.
- **Clamp the current cycle's inferred saving** to a bound (e.g. ≤ 0). Hides real data behind an
  arbitrary cap. Rejected.

## Consequences

- **Accepted data-latency blind spot:** a cycle counts the instant its calendar month closes, so a
  just-closed month whose transactions have not arrived yet (bank Sync lag, or a CSV Upload made
  weeks later) briefly shows as income with little/no spend — the same overstatement, relocated. It
  self-corrects as transactions land, since progress is re-derived with no frozen history (ADR-0007).
  Documented as a v1 limitation.
- The `provisional` flag changes meaning: from "current cycle counted but not final" to "the current
  in-progress cycle is shown but not yet in your total."
- A goal whose start cycle is the current month has zero completed cycles: saved = `startingSaved`,
  on-track true, and the breakdown shows only the not-yet-counted current row.
