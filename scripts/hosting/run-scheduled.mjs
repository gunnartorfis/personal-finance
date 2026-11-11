import { pathToFileURL } from "node:url"
import {
  SCHEDULES,
  scheduledOccurrence,
} from "../../lib/scheduling/execution.mjs"

export async function runScheduled(
  job,
  env = process.env,
  fetchImpl = fetch,
  now = new Date()
) {
  if (!Object.hasOwn(SCHEDULES, job)) throw new Error("Unknown schedule")
  if (env.SCHEDULER_ENABLED !== "true")
    return { event: "schedule.disabled", job }
  if (!env.CRON_SECRET) throw new Error("Scheduler secret required")
  const origin = new URL(env.APP_ORIGIN ?? "")
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  ) {
    throw new Error("Use a canonical HTTPS application origin")
  }
  const response = await fetchImpl(new URL(SCHEDULES[job].path, origin), {
    method: "GET",
    redirect: "error", // Never forward the bearer token to a redirect destination.
    headers: {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      "X-Schedule-Occurrence": scheduledOccurrence(job, now).toISOString(),
    },
    signal: AbortSignal.timeout(300_000),
  })
  // Do not print response bodies, URLs, secrets or provider error messages.
  if (!response.ok) throw new Error("Scheduled execution requires review")
  return { event: "schedule.request_completed", job, status: response.status }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runScheduled(process.argv[2])
    .then((event) => console.log(JSON.stringify(event)))
    .catch(() => {
      console.error(JSON.stringify({ event: "schedule.request_failed" }))
      process.exitCode = 1
    })
}
