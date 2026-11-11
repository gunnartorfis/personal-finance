import { test } from "node:test"
import assert from "node:assert/strict"
import { deploymentOutcome } from "./deploy-service.mjs"

test("a running migration and unrelated/old-environment logs do not authorize web deployment", () => {
  assert.equal(deploymentOutcome({ status: "SUCCESS" }, true), false)
  assert.equal(deploymentOutcome({ status: "SUCCESS" }, true, '{"message":"migration.completed"}'), false)
  assert.equal(deploymentOutcome({ status: "SUCCESS" }, true, JSON.stringify({ message: JSON.stringify({ event: "migration.completed", environment: "staging" }) })), false)
})

test("only a structured production migration completion authorizes the next step", () => {
  const logs = JSON.stringify({ message: JSON.stringify({ event: "migration.completed", environment: "production" }) })
  assert.equal(deploymentOutcome({ status: "SUCCESS" }, true, logs), true)
  assert.throws(() => deploymentOutcome({ status: "CRASHED" }, true, logs))
  assert.throws(() => deploymentOutcome({ status: "SUCCESS" }, true, `${logs}\n${JSON.stringify({ event: "migration.failed" })}`))
})

test("web deployment requires terminal SUCCESS", () => {
  for (const status of ["BUILDING", "DEPLOYING", "WAITING", "SLEEPING"])
    assert.equal(deploymentOutcome({ status }, false), false)
  assert.equal(deploymentOutcome({ status: "SUCCESS" }, false), true)
  assert.throws(() => deploymentOutcome({ status: "FAILED" }, false))
})

test("Railway parsed structured logs retain completion even when message is empty", () => {
  for (const record of [
    { message: "", event: "migration.completed", environment: "production" },
    { message: "", attributes: { event: "migration.completed", environment: "production" } },
    { message: "", attributes: [
      { key: "event", value: '"migration.completed"' },
      { key: "environment", value: '"production"' },
    ] },
  ]) {
    assert.equal(deploymentOutcome({ status: "SUCCESS" }, true, JSON.stringify(record)), true)
    assert.throws(() => deploymentOutcome({ status: "CRASHED" }, true, JSON.stringify(record)))
  }
  assert.throws(() => deploymentOutcome({ status: "SUCCESS" }, true,
    JSON.stringify({ message: "", event: "migration.failed" })))
})
