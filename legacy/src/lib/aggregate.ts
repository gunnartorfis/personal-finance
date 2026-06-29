import { TYPES, type RealType, type TxnView } from "../../shared/types.ts";

const REAL: readonly string[] = TYPES;

/** An expense that counts toward the type breakdown (excludes blank-typed rows). */
export const isExpense = (t: TxnView): boolean => t.amount < 0 && REAL.includes(t.effectiveType);

export const inMonth = (txns: TxnView[], m: string): TxnView[] =>
  m === "all" ? txns : txns.filter((t) => t.month === m);

export const monthsOf = (txns: TxnView[]): string[] =>
  [...new Set(txns.map((t) => t.month))].toSorted();

export function spendByType(list: TxnView[]): Record<RealType, number> {
  const o: Record<RealType, number> = { Fixed: 0, Necessary: 0, "Nice to have": 0 };
  for (const t of list) if (isExpense(t)) o[t.effectiveType as RealType] += -t.amount;
  return o;
}

export const totalSpend = (list: TxnView[]): number =>
  list.reduce((s, t) => (isExpense(t) ? s - t.amount : s), 0);

export type Included = Record<RealType, boolean>;

export const includedSpend = (list: TxnView[], inc: Included): number =>
  list.reduce((s, t) => (isExpense(t) && inc[t.effectiveType as RealType] ? s - t.amount : s), 0);

export const creditsOf = (list: TxnView[]): number =>
  list.reduce((s, t) => (t.amount > 0 ? s + t.amount : s), 0);

export const expenseCount = (list: TxnView[]): number => list.filter(isExpense).length;
