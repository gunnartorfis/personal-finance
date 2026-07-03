/**
 * Client-side calls to the Shared-expense endpoint (ADR-0014). Setting an Own share marks a debit
 * as a Shared expense: only that portion counts as Spending, the rest drops from all math like the
 * fronted-for-others part of Excluded. Setting is per-transaction and reversible; the charged amount
 * is never changed. Both throw on a non-2xx response so callers can surface / revert.
 */
const endpoint = (transactionId: string) =>
  `/api/transactions/${transactionId}/share`

/**
 * Set (or change) a Transaction's Own share (`PUT`). `ownShareAmount` is a negative integer no
 * larger in magnitude than the charge (`amount <= ownShareAmount < 0`).
 */
export async function setOwnShare(
  transactionId: string,
  ownShareAmount: number
): Promise<void> {
  const res = await fetch(endpoint(transactionId), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ownShareAmount }),
  })
  if (!res.ok) throw new Error(`share ${res.status}`)
}

/** Clear a Transaction's Own share (`DELETE`), returning it to its full charged amount. */
export async function clearOwnShare(transactionId: string): Promise<void> {
  const res = await fetch(endpoint(transactionId), { method: "DELETE" })
  if (!res.ok) throw new Error(`share ${res.status}`)
}
