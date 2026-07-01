import type { ExpenseType } from "@/shared/types"

/**
 * Client-side calls to the manual expense-type override endpoint (Phase F). Shared by the inline
 * `<OverrideControl>` dropdown and the keyboard-first `<ReviewMode>` overlay so both persist a change
 * the exact same way. `""` is a valid override (the not-bucketed / split type); clearing reverts to
 * the classified type. Both throw on a non-2xx response so callers can surface / revert.
 */
const endpoint = (transactionId: string) =>
  `/api/transactions/${transactionId}/override`

/** Set or change a transaction's override (`PUT`). */
export async function putOverride(
  transactionId: string,
  expenseType: ExpenseType
): Promise<void> {
  const res = await fetch(endpoint(transactionId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expenseType }),
  })
  if (!res.ok) throw new Error(`override ${res.status}`)
}

/** Clear a transaction's override (`DELETE`), reverting to the classified type. */
export async function clearOverride(transactionId: string): Promise<void> {
  const res = await fetch(endpoint(transactionId), { method: "DELETE" })
  if (!res.ok) throw new Error(`override ${res.status}`)
}
