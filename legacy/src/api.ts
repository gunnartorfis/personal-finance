import type { ExpenseType, IncomeConfig, TxnView } from "../shared/types.ts";

export async function fetchTransactions(): Promise<TxnView[]> {
  const r = await fetch("/api/transactions");
  if (!r.ok) throw new Error(`GET /api/transactions failed: ${r.status}`);
  return (await r.json()) as TxnView[];
}

export async function fetchIncome(): Promise<IncomeConfig> {
  const r = await fetch("/api/income");
  if (!r.ok) throw new Error(`GET /api/income failed: ${r.status}`);
  return (await r.json()) as IncomeConfig;
}

export async function saveIncome(cfg: IncomeConfig): Promise<void> {
  const r = await fetch("/api/income", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cfg),
  });
  if (!r.ok) throw new Error(`POST /api/income failed: ${r.status}`);
}

export async function postOverride(id: number, type: ExpenseType | null): Promise<void> {
  const r = await fetch("/api/overrides", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, type }),
  });
  if (!r.ok) throw new Error(`POST /api/overrides failed: ${r.status}`);
}
