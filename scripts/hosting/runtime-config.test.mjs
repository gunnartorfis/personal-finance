import assert from "node:assert/strict"
import { test } from "node:test"
import { invalidRuntimeConfiguration } from "./runtime-config.mjs"

const configured = {
  DATABASE_URL: "postgresql://synthetic:synthetic@localhost/synthetic",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_c3ludGhldGljLmNsZXJrLmFjY291bnRzLmRldiQ=",
  CLERK_SECRET_KEY: "sk_test_synthetic",
}

test("accepts configured identity/database without requiring unused integrations", () => {
  assert.deepEqual(invalidRuntimeConfiguration(configured), [])
})

test("rejects mismatched Clerk instances and placeholder provider credentials", () => {
  assert.deepEqual(invalidRuntimeConfiguration({
    ...configured, CLERK_SECRET_KEY: "sk_live_synthetic", STRAUMUR_API_KEY: "[SENSITIVE]",
  }), ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "STRAUMUR_API_KEY"])
})

test("invalid URLs and missing credentials produce only variable names", () => {
  const result = invalidRuntimeConfiguration({
    DATABASE_URL: "sensitive-invalid-url", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "[SENSITIVE]",
  })
  assert.deepEqual(result, ["CLERK_SECRET_KEY", "DATABASE_URL", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"])
  assert.ok(!JSON.stringify(result).includes("sensitive-invalid-url"))
})

test("production requires a canonical HTTPS public origin", () => {
  assert.deepEqual(invalidRuntimeConfiguration({ ...configured, NODE_ENV: "production" }), ["APP_ORIGIN"])
  assert.deepEqual(invalidRuntimeConfiguration({ ...configured, NODE_ENV: "production", APP_ORIGIN: "https://synthetic.up.railway.app" }), [])
  for (const APP_ORIGIN of ["http://example.com", "https://user:secret@example.com", "https://example.com/path", "https://example.com?x=1"])
    assert.deepEqual(invalidRuntimeConfiguration({ ...configured, NODE_ENV: "production", APP_ORIGIN }), ["APP_ORIGIN"])
})
