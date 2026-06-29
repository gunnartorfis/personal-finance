/** Database error helpers. */

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

/** Whether an error is a Postgres unique violation (drizzle may wrap the driver error in `cause`). */
export function isUniqueViolation(err: unknown): boolean {
  const codeOf = (e: unknown): unknown =>
    typeof e === "object" && e !== null && "code" in e ? (e as { code?: unknown }).code : undefined;
  return (
    codeOf(err) === UNIQUE_VIOLATION ||
    codeOf((err as { cause?: unknown } | null)?.cause) === UNIQUE_VIOLATION
  );
}
