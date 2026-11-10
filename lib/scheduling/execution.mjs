import { randomUUID, timingSafeEqual } from "node:crypto"

export const SCHEDULES = Object.freeze({
  "billing-renewal": { cron: "0 3 * * *", hour: 3, path: "/api/billing/renew" },
  "bank-sync": { cron: "0 4 * * *", hour: 4, path: "/api/open-banking/sync" },
  "monthly-digest": {
    cron: "0 6 1 * *",
    hour: 6,
    path: "/api/digests/monthly",
  },
})

/** Latest due UTC occurrence; never infer local/DST semantics from the execution host. */
export function scheduledOccurrence(job, now) {
  const schedule = SCHEDULES[job]
  if (!schedule || !Number.isFinite(now.getTime()))
    throw new Error("Invalid schedule")
  const due = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      job === "monthly-digest" ? 1 : now.getUTCDate(),
      schedule.hour
    )
  )
  if (due > now) {
    if (job === "monthly-digest") due.setUTCMonth(due.getUTCMonth() - 1)
    else due.setUTCDate(due.getUTCDate() - 1)
  }
  return due
}

function authorized(request, secret) {
  if (!secret) return false
  const supplied = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  )
}

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })

/**
 * A started occurrence is never automatically reclaimed, even after a crash or owner change.
 * This intentionally favors reconciliation over repeating an uncertain charge/email.
 * @param {keyof typeof SCHEDULES} job
 * @param {(request: Request) => Promise<Response>} handle
 */
export function withScheduledExecution(job, handle, options = {}) {
  return async (request) => {
    const env = options.env ?? process.env
    if (!authorized(request, env.CRON_SECRET))
      return json({ error: "unauthorized" }, 401)
    const owner = env.SCHEDULER_INSTANCE
    if (!owner || !env.DATABASE_URL)
      return json({ error: "scheduler_not_configured" }, 503)
    const now = options.now?.() ?? new Date()
    const occurrence = scheduledOccurrence(job, now)
    // Do not silently use a different billing/email cycle for a very late invocation.
    if (now.getTime() - occurrence.getTime() > 6 * 60 * 60 * 1000) {
      return json({ error: "schedule_window_missed" }, 409)
    }
    const requested = request.headers.get("x-schedule-occurrence")
    if (requested && requested !== occurrence.toISOString()) {
      return json({ error: "schedule_occurrence_mismatch" }, 409)
    }
    const runId = randomUUID()
    let coordinator
    let started = false
    const log = (event) =>
      (options.log ?? console.log)(JSON.stringify({ event, job, runId }))
    try {
      const open =
        options.open ?? (await import("./postgres.mjs")).openCoordinator
      coordinator = await open(env.DATABASE_URL)
      const claim = await coordinator.claim(
        job,
        occurrence.toISOString(),
        owner,
        runId
      )
      if (claim === "already_completed") return json({ skipped: claim })
      if (claim !== "started") return json({ error: claim }, 409)
      started = true
      log("schedule.started")
      const response = await handle(request)
      // These APIs return counts only. Do not persist response payloads or provider errors.
      const summary = await response.clone().json()
      const needsReview =
        !response.ok ||
        summary.skipped ||
        summary.reconciliationRequired > 0 ||
        (job === "billing-renewal"
          ? summary.errored > 0 || summary.pending > 0
          : summary.failed > 0)
      await coordinator.finish(
        runId,
        needsReview ? "reconciliation_required" : "completed"
      )
      log(
        needsReview ? "schedule.reconciliation_required" : "schedule.completed"
      )
      if (needsReview)
        return json({ error: "reconciliation_required", runId }, 503)
      response.headers.set("Cache-Control", "no-store")
      response.headers.set("X-Schedule-Run-Id", runId)
      return response
    } catch {
      if (started) {
        try {
          await coordinator.finish(runId, "reconciliation_required")
        } catch {
          /* Durable 'running' still blocks re-execution. */
        }
      }
      log("schedule.failed")
      return json({ error: "scheduler_failed", runId }, 503)
    } finally {
      if (coordinator) {
        try {
          await coordinator.close()
        } catch {
          log("schedule.connection_close_failed")
        }
      }
    }
  }
}
