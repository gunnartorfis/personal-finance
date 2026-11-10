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

test(
  "forwards SIGTERM and waits for child cleanup",
  { timeout: 10_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "finance-runtime-"))
    await writeFile(
      join(directory, "server.js"),
      `
    setInterval(() => {}, 1000);
    process.on('SIGTERM', () => setTimeout(() => {
      console.log('synthetic-cleanup-complete'); process.exit(0);
    }, 20));
    console.log('synthetic-ready');
  `
    )
    const child = spawn(process.execPath, [start], {
      cwd: directory,
      env: {
        ...process.env,
        DATABASE_URL: "synthetic",
        NEON_AUTH_BASE_URL: "synthetic",
        NEON_AUTH_COOKIE_SECRET: "synthetic",
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
      child.kill("SIGTERM")
      const [code] = await exited
      assert.equal(code, 0)
      assert.ok(output.includes("synthetic-cleanup-complete"))
      assert.ok(output.includes('"event":"runtime.draining"'))
      assert.ok(output.includes('"event":"runtime.exited"'))
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL")
      await rm(directory, { recursive: true, force: true })
    }
  }
)
