import { spawn } from "node:child_process"

// Only allowlisted metadata: no URLs, request bodies, environment dumps or provider errors.
const log = (event, fields = {}) =>
  console.log(JSON.stringify({ event, ...fields }))
const required = [
  "DATABASE_URL",
  "NEON_AUTH_BASE_URL",
  "NEON_AUTH_COOKIE_SECRET",
]
if (required.some((key) => !process.env[key])) {
  log("runtime.configuration_missing", {
    keys: required.filter((key) => !process.env[key]),
  })
  process.exit(1)
}

const child = spawn(process.execPath, ["server.js"], {
  stdio: "inherit",
  env: process.env,
})
log("runtime.starting")
let stopping = false
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    if (stopping) return
    stopping = true
    log("runtime.draining", { signal })
    child.kill(signal)
    // Railway's drain window must exceed this. Next finishes in-flight requests first.
    setTimeout(() => child.kill("SIGKILL"), 310_000).unref()
  })
}
child.on("error", () => {
  log("runtime.spawn_failed")
  process.exit(1)
})
child.on("exit", (code, signal) => {
  log("runtime.exited", { code, signal })
  // Accept an expected forwarded termination; preserve crashes and forced termination as failures.
  process.exit(
    code ?? (stopping && ["SIGTERM", "SIGINT"].includes(signal) ? 0 : 1)
  )
})
