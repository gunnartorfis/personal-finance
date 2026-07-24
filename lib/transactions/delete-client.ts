/**
 * Client-side calls to the per-row soft-delete endpoint (ADR-0026). Deleting hides a manually-owned
 * Transaction from the list and every calculation while retaining it, reversibly; restore brings it
 * back. Both throw on a non-2xx response so callers can surface / revert.
 */
const endpoint = (transactionId: string) =>
  `/api/transactions/${transactionId}/delete`

/** Soft-delete a transaction (`PUT`). */
export async function deleteTransaction(transactionId: string): Promise<void> {
  const res = await fetch(endpoint(transactionId), { method: "PUT" })
  if (!res.ok) throw new Error(`delete ${res.status}`)
}

/** Restore a soft-deleted transaction (`DELETE`). */
export async function restoreTransaction(transactionId: string): Promise<void> {
  const res = await fetch(endpoint(transactionId), { method: "DELETE" })
  if (!res.ok) throw new Error(`restore ${res.status}`)
}
