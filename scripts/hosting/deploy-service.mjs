import { execFileSync } from "node:child_process"
import { appendFileSync } from "node:fs"
import { setTimeout } from "node:timers/promises"
import { pathToFileURL } from "node:url"

const project = "2c2ceec6-dacc-4c72-9f2a-fc1f980d57ec"
const environment = "55011e12-2ebb-4637-bf00-fe7a95f4fef1"

// A successful build or a running migration container is not migration completion.
export function deploymentOutcome(deployment, migration, logText = "") {
  if (["FAILED", "CRASHED", "REMOVED", "REMOVING", "SKIPPED", "NEEDS_APPROVAL"].includes(deployment.status))
    throw new Error("Deployment did not complete successfully")
  if (!migration) return deployment.status === "SUCCESS"
  const events = logText.split("\n").flatMap((line) => {
    try {
      const record = JSON.parse(line)
      return [typeof record.message === "string" ? JSON.parse(record.message) : record]
    } catch { return [] }
  })
  if (events.some((event) => event.event === "migration.failed"))
    throw new Error("Migration failed; web deployment blocked")
  return events.some((event) => event.event === "migration.completed" && event.environment === "production")
}

export async function deployService(service) {
  if (!["migrations", "web"].includes(service)) throw new Error("Unknown release service")
  const cli = process.env.RAILWAY_CLI
  if (!cli) throw new Error("RAILWAY_CLI must name the pinned CLI binary")
  const scope = ["--project", project, "--environment", environment, "--service", service]
  const read = (args) => execFileSync(cli, args, { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] })
  const list = () => {
    const deployments = JSON.parse(read(["deployment", "list", ...scope, "--json", "--limit", "100"]))
    if (!Array.isArray(deployments)) throw new Error("Unexpected deployment list response")
    return deployments
  }
  const previous = new Set(list().map((deployment) => deployment.id))
  execFileSync(cli, ["up", ...scope, "--ci"], { stdio: "inherit", timeout: 1_200_000 })
  let deploymentId
  const deadline = Date.now() + 600_000
  while (Date.now() < deadline) {
    const added = list().filter((deployment) => !previous.has(deployment.id))
    if (added.length > 1) throw new Error("Concurrent deployment detected; refusing ambiguous release")
    if (added.length === 1) {
      const deployment = added[0]
      if (deploymentId && deployment.id !== deploymentId) throw new Error("Release deployment changed")
      deploymentId = deployment.id
      const logs = service === "migrations"
        ? read(["logs", deploymentId, ...scope, "--deployment", "--json", "--lines", "100"])
        : ""
      if (deploymentOutcome(deployment, service === "migrations", logs)) {
        // Only IDs and fixed events are emitted; runtime logs can contain private data.
        console.log(JSON.stringify({ event: "release.service.completed", service, deploymentId }))
        if (process.env.GITHUB_STEP_SUMMARY)
          appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${service} deployment: \`${deploymentId}\`\n`)
        return
      }
    }
    await setTimeout(5000)
  }
  throw new Error("Deployment completion timed out; inspect before retrying")
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  deployService(process.argv[2]).catch(() => {
    console.error(JSON.stringify({ event: "release.service.failed", action: "Inspect deployment before retrying" }))
    process.exitCode = 1
  })
}
