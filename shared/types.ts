export type ExpenseType = "Fixed" | "Necessary" | "Nice to have" | "";

export const TYPES = ["Fixed", "Necessary", "Nice to have"] as const;
export type RealType = (typeof TYPES)[number];

/** A classified transaction as stored in data/transactions.json. */
export interface Txn {
  id: number; // stable: source CSV row index
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  merchant: string;
  category: string;
  amount: number; // ISK, negative = expense, positive = credit
  type: ExpenseType; // AI- (or seed-) assigned
  confidence: number | null; // 0..1, null for non-AI rows (credits)
  reasoning: string;
}

/** A transaction enriched with manual override info, as served by the dev API. */
export interface TxnView extends Txn {
  aiType: ExpenseType; // == stored `type`
  override: ExpenseType | null; // manual override, if any
  effectiveType: ExpenseType; // override ?? aiType — use this for all aggregation
}

export type Overrides = Record<string, ExpenseType>; // id -> type

/** A recurring monthly income source (e.g. a salary). */
export interface Source {
  name: string;
  amt: number;
}

/** The income/net config, persisted server-side to data/income.json. */
export interface IncomeConfig {
  sources: Source[]; // recurring monthly income (salaries)
  monthExtra: Record<string, number>; // per-month one-off income, keyed by billing month YYYY-MM
  fixedExpenses: Source[]; // recurring monthly fixed expenses, off-card (rent, loans, …)
  included: Record<RealType, boolean>; // which card expense types count toward net
}

export const DEFAULT_INCOME: IncomeConfig = {
  sources: [{ name: "Salary", amt: 0 }],
  monthExtra: {},
  fixedExpenses: [],
  included: { Fixed: true, Necessary: true, "Nice to have": true },
};
