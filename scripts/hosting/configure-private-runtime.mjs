import { spawnSync } from "node:child_process"
import { createPrivateKey, randomBytes } from "node:crypto"
import { readFileSync, writeFileSync, chmodSync } from "node:fs"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"

// Run from the user's network-enabled terminal. Values use stdin, never argv or logs.
const root = fileURLToPath(new URL("../../", import.meta.url))
const secretFile = new URL("../../.env.railway-cron.local", import.meta.url)
try {
  let secret
  try {
    secret = readFileSync(secretFile, "utf8").trim().replace(/^CRON_SECRET=/, "")
    if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error("Invalid saved cron secret")
  } catch (error) {
    if (error.code !== "ENOENT") throw error
    secret = randomBytes(32).toString("hex")
    writeFileSync(secretFile, `CRON_SECRET=${secret}\n`, { mode: 0o600, flag: "wx" })
  }
  chmodSync(secretFile, 0o600)
  if (process.argv.includes("--generate-only")) {
    console.log("Cron secret generated/preserved in ignored mode-0600 file; no value displayed.")
  } else {
    const pem = readFileSync(`${homedir()}/Downloads/0f1c6d59-c41d-4e3b-87e3-8f0eb592da8a.pem`, "utf8")
    const key = createPrivateKey(pem)
    if (key.asymmetricKeyType !== "rsa") throw new Error("Expected RSA banking key")
    for (const [name, value] of Object.entries({
      CRON_SECRET: secret,
      ENABLE_BANKING_PRIVATE_KEY: pem,
    })) {
      const result = spawnSync("railway", [
        "variable", "set", name, "--stdin", "--skip-deploys",
        "--project", "2c2ceec6-dacc-4c72-9f2a-fc1f980d57ec",
        "--environment", "55011e12-2ebb-4637-bf00-fe7a95f4fef1",
        "--service", "7ca219f0-5894-4257-909c-735b36eee88a",
      ], {
        cwd: root,
        input: value,
        stdio: ["pipe", "ignore", "ignore"],
        env: { ...process.env, RAILWAY_CALLER: "skill:use-railway@1.3.5", RAILWAY_AGENT_SESSION: "personal-finance-runtime-20261110" },
        timeout: 30_000,
      })
      if (result.status !== 0) throw new Error("Railway update failed")
      console.log(`${name}: configured without deploying or printing its value`)
    }
  }
} catch {
  console.error("Runtime configuration failed. Check Railway login/network and the original PEM locally. No credential values were logged.")
  process.exitCode = 1
}
