/** A transaction row considered for inter-account transfer matching. */
export interface TransferCandidate {
  id: string;
  /** Which Account the row belongs to; the two legs of a transfer live in different accounts. */
  accountId: string;
  /** Charged amount, signed as stored: negative = money out, positive = money in. */
  amount: number;
  /** Transaction date, `YYYY-MM-DD`. */
  date: string;
}

/**
 * A detected inter-account transfer: a debit in a funding Account matched to the equal-and-opposite
 * credit it landed as in another Account (a card-bill payment, a savings sweep). Both legs are
 * money movement between the Household's own accounts — not spend and not income (issue #97).
 */
export interface TransferPair {
  /** The money-out leg (`amount < 0`). */
  fromId: string;
  /** The money-in leg (`amount > 0`). */
  toId: string;
}

/** Max days between the two legs of a transfer for them to be considered the same movement. */
const DEFAULT_WINDOW_DAYS = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / MS_PER_DAY;
}

/**
 * Pair each money-out leg with the equal-and-opposite money-in leg it landed as in another Account
 * within {@link DEFAULT_WINDOW_DAYS}. Greedy and order-stable: debits are matched in input order and
 * each leg is consumed at most once, so N same-amount debits pair with N distinct credits (a
 * left-over leg stays unpaired). Amounts must match exactly — near-miss/fee tolerance is future work.
 *
 * Candidate `id`s are assumed unique (they are DB primary keys); the function still defends against a
 * duplicate `id` slipping in from an upstream dedup bug by consuming each debit and credit id once,
 * so a repeated row can't manufacture spurious extra pairs.
 */
export function detectTransferPairs(
  candidates: ReadonlyArray<TransferCandidate>,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): TransferPair[] {
  const credits = candidates.filter((c) => c.amount > 0);
  const claimed = new Set<string>();
  const pairs: TransferPair[] = [];

  for (const debit of candidates) {
    if (debit.amount >= 0 || claimed.has(debit.id)) continue;
    const match = credits.find(
      (credit) =>
        !claimed.has(credit.id) &&
        credit.accountId !== debit.accountId &&
        credit.amount === -debit.amount &&
        daysApart(credit.date, debit.date) <= windowDays,
    );
    if (match) {
      claimed.add(debit.id);
      claimed.add(match.id);
      pairs.push({ fromId: debit.id, toId: match.id });
    }
  }

  return pairs;
}
