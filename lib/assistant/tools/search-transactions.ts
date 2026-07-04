import { z } from "zod";

import { currentCycleKey, cycleKeyRange, recentCycleKeys } from "@/lib/dashboard/cycle";
import { normalizeMerchant } from "@/shared/merchant-rules";
import { EXPENSE_TYPES, type ExpenseType } from "@/shared/types";

import { cycleKeySchema } from "./cycle-input";
import type { AssistantTool, AssistantToolContext } from "./types";

const DEFAULT_WINDOW_CYCLES = 3;
const DEFAULT_LIMIT = 20;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

const searchSchema = z
  .object({
    /** Case-insensitive merchant match on the normalized name (store numbers stripped). */
    text: z.string().min(1).max(100).optional(),
    /** Restrict to one cycle (YYYY-MM). Overrides from/to. */
    cycle: cycleKeySchema.optional(),
    /** Explicit half-open date window `[from, to)` (YYYY-MM-DD); both required together. */
    from: isoDate.optional(),
    to: isoDate.optional(),
    /** Filter by charge magnitude (absolute value), inclusive. */
    minAmount: z.number().nonnegative().optional(),
    maxAmount: z.number().nonnegative().optional(),
    expenseType: z.enum(EXPENSE_TYPES).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  // Reject a one-sided window: a lone `from`/`to` would otherwise silently fall back to the default
  // range, dropping the caller's date intent with no signal to retry.
  .refine((d) => (d.from == null) === (d.to == null), {
    message: "from and to must be provided together",
    path: ["to"],
  })
  // Reject an inverted window, which would vacuously match nothing and read as "no transactions".
  .refine((d) => d.from == null || d.to == null || d.from <= d.to, {
    message: "from must not be after to",
    path: ["to"],
  });
type SearchInput = z.infer<typeof searchSchema>;

/** One matched transaction (trimmed for the model). `amount` keeps its sign (debits negative). */
export interface FoundTransaction {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  expenseType: ExpenseType | null;
  /** Dropped from all math (ADR-0011) — surfaced so the model doesn't sum it as spend. */
  excluded: boolean;
  /**
   * An inter-account transfer leg (e.g. a card-bill payment, #97). Spend-math helpers drop these, so
   * it's flagged here to keep the model from double-counting a transfer as spend.
   */
  isTransfer: boolean;
  incomeMarked: boolean;
}

export interface SearchTransactionsResult {
  range: { from: string; to: string };
  /** Total matches in range (may exceed `transactions.length` when capped by `limit`). */
  count: number;
  transactions: FoundTransaction[];
}

/** Resolve the search window: explicit cycle, explicit from/to, else the trailing N cycles. */
function resolveRange(ctx: AssistantToolContext, input: SearchInput): { from: string; to: string } {
  if (input.cycle) return cycleKeyRange(input.cycle);
  if (input.from && input.to) return { from: input.from, to: input.to };
  const keys = recentCycleKeys(ctx.now, DEFAULT_WINDOW_CYCLES);
  return { from: cycleKeyRange(keys[0]).from, to: cycleKeyRange(currentCycleKey(ctx.now)).to };
}

/** `searchTransactions` — look up individual charges by merchant / amount / type in a window. */
export const searchTransactionsTool: AssistantTool<SearchInput, SearchTransactionsResult> = {
  name: "searchTransactions",
  description:
    "Find individual transactions in a window (a `cycle`, an explicit `from`/`to`, or the last 3 " +
    "cycles by default) filtered by merchant `text`, amount magnitude (`minAmount`/`maxAmount`), and " +
    "`expenseType`. Returns up to `limit` (default 20) newest-first, plus the true match `count`. " +
    "Rows keep their sign and carry `excluded`/`incomeMarked` flags — do not sum excluded rows as spend.",
  inputSchema: searchSchema,
  async run(ctx, input) {
    const range = resolveRange(ctx, input);
    const rows = await ctx.repo.transactions.listWithOverrides(range);
    const needle = input.text ? normalizeMerchant(input.text) : null;
    const limit = input.limit ?? DEFAULT_LIMIT;

    const matched = rows.filter((row) => {
      if (needle && !normalizeMerchant(row.merchant).includes(needle)) return false;
      const magnitude = Math.abs(row.amount);
      if (input.minAmount != null && magnitude < input.minAmount) return false;
      if (input.maxAmount != null && magnitude > input.maxAmount) return false;
      if (input.expenseType != null && (row.overrideType ?? row.classifiedType) !== input.expenseType) {
        return false;
      }
      return true;
    });

    return {
      range,
      count: matched.length,
      transactions: matched.slice(0, limit).map((row) => ({
        id: row.id,
        date: row.date,
        merchant: row.merchant,
        amount: row.amount,
        expenseType: (row.overrideType ?? row.classifiedType) as ExpenseType | null,
        excluded: row.excluded,
        isTransfer: row.transferGroupId != null,
        incomeMarked: row.incomeMarked,
      })),
    };
  },
};
