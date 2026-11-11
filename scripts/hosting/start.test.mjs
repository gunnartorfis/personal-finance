import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

const start = fileURLToPath(new URL("./start.mjs", import.meta.url))

test("fails closed without runtime secrets, without printing their values", async () => {
  const child = spawn(process.execPath, [start], {
    env: { PATH: process.env.PATH },
  })
  let output = ""
  child.stdout.on("data", (data) => {
    output += data
  })
  const [code] = await once(child, "exit")
  assert.equal(code, 1)
  const event = JSON.parse(output)
  assert.equal(event.event, "runtime.configuration_missing")
  assert.ok(event.keys.includes("DATABASE_URL"))
})

for (const [signal, serverCode, expectedCode] of [
  ["SIGTERM", 0, 0],
  ["SIGTERM", 143, 0],
  ["SIGINT", 130, 0],
  ["SIGTERM", 1, 1],
]) test(
  `forwards ${signal}, waits for cleanup, and maps child exit ${serverCode} to ${expectedCode}`,
  { timeout: 10_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "finance-runtime-"))
    await writeFile(
      join(directory, "server.js"),
      `
    setInterval(() => {}, 1000);
    process.on('${signal}', () => setTimeout(() => {
      console.log('synthetic-cleanup-complete'); process.exit(${serverCode});
    }, 20));
    console.log('synthetic-ready');
  `
    )
    const child = spawn(process.execPath, [start], {
      cwd: directory,
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://synthetic:synthetic@localhost/synthetic",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_c3ludGhldGljLmNsZXJrLmFjY291bnRzLmRldiQ=",
        CLERK_SECRET_KEY: "sk_test_synthetic",
      },
    })
    const exited = once(child, "exit")
    let output = ""
    try {
      await new Promise((resolve, reject) => {
        child.stdout.on("data", (data) => {
          output += data
          if (output.includes("synthetic-ready")) resolve()
        })
        child.once("error", reject)
        child.once("exit", () => reject(new Error("Child exited before ready")))
      })
      child.kill(signal)
      const [code] = await exited
      assert.equal(code, expectedCode)
      assert.ok(output.includes("synthetic-cleanup-complete"))
      assert.ok(output.includes('"event":"runtime.draining"'))
      assert.ok(output.includes('"event":"runtime.exited"'))
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL")
      await rm(directory, { recursive: true, force: true })
    }
  }
)
