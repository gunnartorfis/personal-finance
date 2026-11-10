import { spawn } from "node:child_process"
import { pathToFileURL } from "node:url"

import { migrateOperations } from "./migrate-operations.mjs"

// Allow diagnostic codes only: driver messages, SQL, detail and connection URLs may
// contain financial data or credentials. Drizzle can wrap the driver in `cause`.
const diagnosticCodes = new Set([
  "08000", "08001", "08003", "08004", "08006", "23503", "23505",
  "28P01", "3D000", "40001", "40P01", "42501", "42701", "42703",
  "42P01", "42P07", "53300", "55P03", "57014", "57P01",
  "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT",
])

export function migrationFailure(error) {
  for (let depth = 0; error && depth < 4; depth++, error = error.cause) {
    if (diagnosticCodes.has(error.code))
      return { event: "migration.failed", code: error.code }
  }
  return { event: "migration.failed", code: "UNCLASSIFIED" }
}

function phase(name) {
  console.log(JSON.stringify({ event: "migration.phase", phase: name }))
}

export function validateMigrationEnvironment(env) {
  if (env.VERCEL_ENV || env.NEXT_PHASE || env.CI_PULL_REQUEST) {
    throw new Error("Migrations cannot run in builds or previews")
  }
  if (
    !["development", "staging", "production"].includes(
      env.MIGRATION_ENVIRONMENT
    )
  ) {
    throw new Error("Set MIGRATION_ENVIRONMENT explicitly")
  }
  if (
    env.RAILWAY_ENVIRONMENT_NAME &&
    env.RAILWAY_ENVIRONMENT_NAME !== env.MIGRATION_ENVIRONMENT
  ) {
    throw new Error("Railway environment does not match migration target")
  }
  if (env.MIGRATION_APPROVED !== "true")
    throw new Error("Explicit migration approval required")
  const url = new URL(env.DATABASE_URL ?? "")
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !env.MIGRATION_DATABASE_HOST ||
    url.hostname !== env.MIGRATION_DATABASE_HOST
  ) {
    throw new Error(
      "Database host must match the independently configured migration target"
    )
  }
  return env.MIGRATION_ENVIRONMENT
}

function run(command, env, signal) {
  return new Promise((resolve, reject) => {
    // Never pass provider/database error text through to CI logs: it can contain credentials/data.
    signal.throwIfAborted()
    const child = spawn(
      process.execPath,
      ["node_modules/drizzle-kit/bin.cjs", command],
      { stdio: "ignore", env, signal }
    )
    let failed = false
    child.on("error", () => {
      failed = true
    })
    // Keep the lock until the process has actually closed, including on cancellation.
    child.on("close", (code) =>
      !failed && !signal.aborted && code === 0
        ? resolve()
        : reject(new Error(`Migration ${command} failed`))
    )
  })
}

export async function migrate(env = process.env) {
  phase("validation")
  const environment = validateMigrationEnvironment(env)
  const { Client } = await import("pg")
  // A direct/session Neon endpoint is required: transaction poolers cannot hold session locks.
  if (new URL(env.DATABASE_URL).hostname.includes("-pooler"))
    throw new Error("Use the direct migration endpoint")
  const client = new Client({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
  })
  const controller = new AbortController()
  const abort = () => controller.abort()
  client.on("error", abort)
  process.on("SIGTERM", abort)
  process.on("SIGINT", abort)
  try {
    phase("connect")
    await client.connect()
    phase("lock")
    const { rows } = await client.query(
      "select pg_try_advisory_lock(724915, 1) as locked"
    )
    if (!rows[0].locked) throw new Error("Another migration is running")
    // Preserve the repository's migration-file checks as well as CI's separate drift gate.
    phase("check")
    await run("check", env, controller.signal)
    controller.signal.throwIfAborted()
    // Run on the SAME session that owns the advisory lock. A separate migrating child
    // could otherwise outlive its parent's lost lock and overlap a second release.
    const { drizzle } = await import("drizzle-orm/node-postgres")
    const { migrate: applyFinancialMigrations } =
      await import("drizzle-orm/node-postgres/migrator")
    phase("financial-migrations")
    await applyFinancialMigrations(drizzle(client), {
      migrationsFolder: "./drizzle",
    })
    controller.signal.throwIfAborted()
    phase("hosting-migrations")
    await migrateOperations(client)
    console.log(JSON.stringify({ event: "migration.completed", environment }))
  } finally {
    process.off("SIGTERM", abort)
    process.off("SIGINT", abort)
    await client.end()
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  migrate().catch((error) => {
    console.error(JSON.stringify(migrationFailure(error)))
    process.exitCode = 1
  })
}
