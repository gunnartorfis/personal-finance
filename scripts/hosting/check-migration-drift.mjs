import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

async function snapshot(directory) {
  const result = []
  for (const name of (await readdir(directory, { recursive: true })).sort()) {
    if (!name.endsWith(".sql") && !name.endsWith(".json")) continue
    const hash = createHash("sha256").update(await readFile(join(directory, name))).digest("hex")
    result.push([name, hash])
  }
  return JSON.stringify(result)
}

const before = await snapshot("drizzle")
// Generate is offline; remove any accidentally inherited database connection.
const generated = spawnSync(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "generate"], {
  stdio: "inherit", env: { ...process.env, DATABASE_URL: "" },
})
if (generated.status !== 0) throw new Error("Migration generation check failed")
if (before !== await snapshot("drizzle"))
  throw new Error("Schema changed without committed migrations; generate and commit them before merging")
console.log(JSON.stringify({ event: "migration.drift_check", status: "passed" }))
