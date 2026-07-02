/**
 * Client-side calls to the manual exclude endpoint (ADR-0011). An Excluded transaction drops out of
 * every calculation; excluding is per-transaction, reversible, and clears any income mark. Both
 * throw on a non-2xx response so callers can surface / revert.
 */
const endpoint = (transactionId: string) =>
  `/api/transactions/${transactionId}/exclude`

/** Exclude a transaction (`PUT`), optionally recording why. */
export async function excludeTransaction(
  transactionId: string,
  note?: string | null
): Promise<void> {
  const trimmed = note?.trim()
  const res = await fetch(endpoint(transactionId), {
    method: "PUT",
    ...(trimmed
      ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ note: trimmed }),
        }
      : {}),
  })
  if (!res.ok) throw new Error(`exclude ${res.status}`)
}

/** Re-include a transaction (`DELETE`), returning it to the calculations. */
export async function includeTransaction(transactionId: string): Promise<void> {
  const res = await fetch(endpoint(transactionId), { method: "DELETE" })
  if (!res.ok) throw new Error(`exclude ${res.status}`)
}
