import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

/** Reviewed infrastructure schema, intentionally separate from Drizzle's financial schema. */
export async function migrateOperations(client) {
  const version = "0001_scheduled_execution"
  const sql = await readFile(
    new URL(`../../ops-migrations/${version}.sql`, import.meta.url),
    "utf8"
  )
  const hash = createHash("sha256").update(sql).digest("hex")
  await client.query("BEGIN")
  try {
    await client.query("CREATE SCHEMA IF NOT EXISTS hosting")
    await client.query(`CREATE TABLE IF NOT EXISTS hosting.schema_migrations (
      version text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`)
    const existing = await client.query(
      "SELECT hash FROM hosting.schema_migrations WHERE version = $1",
      [version]
    )
    if (existing.rows.length) {
      if (existing.rows[0].hash !== hash)
        throw new Error("Applied operations migration changed")
    } else {
      await client.query(sql)
      await client.query(
        "INSERT INTO hosting.schema_migrations(version, hash) VALUES ($1, $2)",
        [version, hash]
      )
    }
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  }
}
