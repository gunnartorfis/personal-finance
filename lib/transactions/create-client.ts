import type { ExpenseType } from "@/shared/types"

/**
 * Client-side call to hand-enter a Transaction (ADR-0026). Posts a `manual`-source row; an optional
 * expense type (debit only) is stored as an Override. Throws on a non-2xx response so the form can
 * surface the failure.
 */
export interface CreateTransactionInput {
  accountId: string
  /** `YYYY-MM-DD`. */
  date: string
  /** Signed integer in whole billing-currency units; negative = expense. */
  amount: number
  merchant: string
  /** Optional real expense bucket for a debit; omit to let the AI classify it. */
  expenseType?: Exclude<ExpenseType, "">
}

export async function createTransaction(
  input: CreateTransactionInput
): Promise<void> {
  const res = await fetch("/api/transactions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(`create ${res.status}`)
}
