import { normalizeMerchant } from "@/shared/merchant-rules";

/** One debit charge considered for recurring detection: its date, merchant, and charged amount. */
export interface RecurringChargeRow {
  /** `YYYY-MM-DD`. */
  date: string;
  merchant: string;
  /** Charged amount as stored (negative for a debit); magnitude is what's compared. */
  amount: number;
}

/** A merchant detected as a recurring/subscription charge. */
export interface RecurringCharge {
  /** Normalized merchant name (store-number stripped, upper-cased). */
  merchant: string;
  /** Representative monthly charge magnitude (positive), the median across the window's months. */
  monthlyAmount: number;
  /** How many distinct calendar months in the window carried a charge. */
  occurrences: number;
  /** The most recent `YYYY-MM` a charge appeared in. */
  lastMonth: string;
}

/** The recurring-spend summary: the detected subscriptions and their total committed monthly spend. */
export interface RecurringSummary {
  subscriptions: RecurringCharge[];
  /** Sum of every subscription's `monthlyAmount` — the household's committed monthly spend. */
  committedMonthlyTotal: number;
}

export interface RecurringOptions {
  /** Calendar months back from `now` (inclusive) to consider. */
  windowMonths: number;
  /** Minimum distinct months with a charge for a merchant to count as recurring. */
  minOccurrences: number;
  /** Max fractional spread of monthly magnitudes around the median to still be "similar". */
  amountTolerance: number;
}

export const DEFAULT_RECURRING_OPTIONS: RecurringOptions = {
  windowMonths: 6,
  minOccurrences: 3,
  amountTolerance: 0.15,
};

/** The `YYYY-MM` calendar-month key of a `YYYY-MM-DD` date string. */
function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** The `windowMonths` most recent calendar-month keys ending at `now` (UTC), oldest first. */
function recentMonthKeys(now: Date, windowMonths: number): string[] {
  const keys: string[] = [];
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-based
  for (let back = windowMonths - 1; back >= 0; back -= 1) {
    const d = new Date(Date.UTC(year, month - back, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Detect recurring/subscription charges: group debits by normalized merchant, and flag a merchant
 * that charged a similar amount in at least `minOccurrences` distinct calendar months within the
 * `windowMonths` ending at `now`. Pure and deterministic (the DB read lives in the loader). Credits
 * are ignored. "Similar" means every month's summed magnitude sits within `amountTolerance` of the
 * median; the reported `monthlyAmount` is that median. Sorted by `monthlyAmount` desc, then merchant.
 */
export function computeRecurringCharges(
  rows: ReadonlyArray<RecurringChargeRow>,
  now: Date,
  options: RecurringOptions = DEFAULT_RECURRING_OPTIONS,
): RecurringSummary {
  const window = new Set(recentMonthKeys(now, options.windowMonths));

  // Group on the exact normalized merchant (store-number stripped). We deliberately do NOT apply the
  // rules-engine's prefix/location merge here: real subscriptions (Netflix, Spotify, SaaS, gyms) post
  // as stable card-on-file strings, whereas location suffixes (KRINGLAN, REYKJAVIK) mark physical POS
  // merchants that aren't subscriptions — prefix-merging them would falsely fuse distinct merchants
  // into a phantom "recurring" charge. Revisit with a location dictionary if real data shows splits.
  // normalized merchant -> (month key -> summed charge magnitude that month).
  const byMerchant = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (row.amount >= 0) continue; // credits are not spend
    const key = monthKey(row.date);
    if (!window.has(key)) continue;
    const merchant = normalizeMerchant(row.merchant);
    const months = byMerchant.get(merchant) ?? new Map<string, number>();
    months.set(key, (months.get(key) ?? 0) + Math.abs(row.amount));
    byMerchant.set(merchant, months);
  }

  const subscriptions: RecurringCharge[] = [];
  for (const [merchant, months] of byMerchant) {
    if (months.size < options.minOccurrences) continue;
    const amounts = [...months.values()];
    const mid = median(amounts);
    const similar = amounts.every((a) => Math.abs(a - mid) <= mid * options.amountTolerance);
    if (!similar) continue;
    subscriptions.push({
      merchant,
      monthlyAmount: mid,
      occurrences: months.size,
      lastMonth: [...months.keys()].sort().at(-1)!,
    });
  }

  subscriptions.sort((a, b) => b.monthlyAmount - a.monthlyAmount || a.merchant.localeCompare(b.merchant));
  const committedMonthlyTotal = subscriptions.reduce((sum, s) => sum + s.monthlyAmount, 0);
  return { subscriptions, committedMonthlyTotal };
}
