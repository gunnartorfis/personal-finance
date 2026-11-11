import assert from "node:assert/strict"
import { test } from "node:test"
import { migrationFailure, validateMigrationEnvironment } from "./migrate.mjs"

const env = {
  MIGRATION_ENVIRONMENT: "staging",
  MIGRATION_APPROVED: "true",
  DATABASE_URL: "postgresql://test:synthetic@staging.example.invalid/db",
  MIGRATION_DATABASE_HOST: "staging.example.invalid",
}

test("migration diagnostics expose only approved codes, including wrapped driver errors", () => {
  const sensitive = "postgresql://user:secret@host/db SECRET-MERCHANT -4242"
  const driver = Object.assign(new Error(sensitive), {
    code: "42P07", detail: sensitive, query: sensitive,
  })
  assert.deepEqual(migrationFailure(new Error(sensitive, { cause: driver })), {
    event: "migration.failed", code: "42P07",
  })
  assert.deepEqual(migrationFailure({ code: sensitive, message: sensitive }), {
    event: "migration.failed", code: "UNCLASSIFIED",
  })
  const cyclic = { code: sensitive }
  cyclic.cause = cyclic
  assert.equal(migrationFailure(cyclic).code, "UNCLASSIFIED")
  assert.equal(migrationFailure({ code: "ENOTFOUND" }).code, "ENOTFOUND")
})

test("requires approval and an independent database host match", () => {
  assert.equal(validateMigrationEnvironment(env), "staging")
  assert.throws(() =>
    validateMigrationEnvironment({ ...env, MIGRATION_APPROVED: "false" })
  )
  assert.throws(() =>
    validateMigrationEnvironment({
      ...env,
      MIGRATION_DATABASE_HOST: "production.example.invalid",
    })
  )
  assert.throws(() =>
    validateMigrationEnvironment({ ...env, MIGRATION_DATABASE_HOST: "" })
  )
  assert.throws(() =>
    validateMigrationEnvironment({ ...env, MIGRATION_ENVIRONMENT: "preview" })
  )
})

test("rejects build/preview contexts and environment mismatches", () => {
  for (const extra of [
    { VERCEL_ENV: "production" },
    { VERCEL_ENV: "preview" },
    { NEXT_PHASE: "phase-production-build" },
    { CI_PULL_REQUEST: "123" },
    { RAILWAY_ENVIRONMENT_NAME: "production" },
  ]) {
    assert.throws(() => validateMigrationEnvironment({ ...env, ...extra }))
  }
})

test("only the configured Railway service may own pre-deploy migrations", () => {
  const owned = { ...env, RAILWAY_SERVICE_ID: "web", MIGRATION_SERVICE_ID: "web" }
  assert.equal(validateMigrationEnvironment(owned), "staging")
  assert.throws(() => validateMigrationEnvironment({ ...owned, RAILWAY_SERVICE_ID: "worker" }))
  assert.throws(() => validateMigrationEnvironment({ ...owned, MIGRATION_SERVICE_ID: "" }))
})
