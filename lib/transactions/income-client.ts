/**
 * Client-side calls to the manual income-marking endpoint (ADR-0009). Credits count for nothing
 * in any calculation unless marked as income; marking is per-transaction and reversible. Both
 * throw on a non-2xx response so callers can surface / revert.
 */
const endpoint = (transactionId: string) =>
  `/api/transactions/${transactionId}/income`

/** Mark a credit as income (`PUT`). */
export async function markIncome(transactionId: string): Promise<void> {
  const res = await fetch(endpoint(transactionId), { method: "PUT" })
  if (!res.ok) throw new Error(`income ${res.status}`)
}

/** Unmark a credit (`DELETE`), excluding it from calculations again. */
export async function unmarkIncome(transactionId: string): Promise<void> {
  const res = await fetch(endpoint(transactionId), { method: "DELETE" })
  if (!res.ok) throw new Error(`income ${res.status}`)
}
