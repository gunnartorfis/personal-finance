import assert from "node:assert/strict"
import { test } from "node:test"
import { readFile } from "node:fs/promises"
import {
  SCHEDULES,
  scheduledOccurrence,
  withScheduledExecution,
} from "../../lib/scheduling/execution.mjs"
import { runScheduled } from "./run-scheduled.mjs"

const env = {
  CRON_SECRET: "synthetic-secret",
  DATABASE_URL: "synthetic",
  SCHEDULER_INSTANCE: "railway-staging",
}
const now = new Date("2026-11-10T03:01:00Z")
const request = (secret = env.CRON_SECRET, occurrence) =>
  new Request("https://test.example.invalid/api/billing/renew", {
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(occurrence ? { "x-schedule-occurrence": occurrence } : {}),
    },
  })
const ok = () => Response.json({ charged: 1, errored: 0 })

function fixture() {
  const state = {
    owner: env.SCHEDULER_INSTANCE,
    runs: [],
    failFinish: false,
    opens: 0,
  }
  const open = async () => {
    state.opens++
    return {
      async claim(job, occurrence, owner, runId) {
        if (owner !== state.owner) return "scheduler_not_owner"
        if (state.runs.some((run) => run.status !== "completed"))
          return "reconciliation_required"
        if (state.runs.some((run) => run.occurrence === occurrence))
          return "already_completed"
        state.runs.push({ runId, occurrence, status: "running" })
        return "started"
      },
      async finish(runId, status) {
        if (state.failFinish) throw new Error("synthetic database failure")
        state.runs.find((run) => run.runId === runId).status = status
      },
      async close() {},
    }
  }
  return { state, options: { env, open, now: () => now, log: () => {} } }
}

test("UTC schedules retain daily and monthly boundary semantics", () => {
  assert.equal(
    scheduledOccurrence("billing-renewal", now).toISOString(),
    "2026-11-10T03:00:00.000Z"
  )
  assert.equal(
    scheduledOccurrence("bank-sync", now).toISOString(),
    "2026-11-09T04:00:00.000Z"
  )
  assert.equal(
    scheduledOccurrence(
      "monthly-digest",
      new Date("2026-01-01T05:59:59Z")
    ).toISOString(),
    "2025-12-01T06:00:00.000Z"
  )
  assert.equal(
    scheduledOccurrence(
      "monthly-digest",
      new Date("2026-01-01T06:00:00Z")
    ).toISOString(),
    "2026-01-01T06:00:00.000Z"
  )
  assert.equal(
    scheduledOccurrence(
      "billing-renewal",
      new Date("2026-03-29T03:00:00Z")
    ).toISOString(),
    "2026-03-29T03:00:00.000Z"
  )
})

test("rejects unauthorized/configuration/window/replay errors before opening a database", async () => {
  const { state, options } = fixture()
  const handle = withScheduledExecution(
    "billing-renewal",
    async () => {
      throw new Error("Must not execute")
    },
    options
  )
  assert.equal((await handle(request("wrong"))).status, 401)
  assert.equal(
    (await handle(request(env.CRON_SECRET, "2026-11-09T03:00:00.000Z"))).status,
    409
  )
  const late = withScheduledExecution("billing-renewal", ok, {
    ...options,
    now: () => new Date("2026-11-10T10:00:00Z"),
  })
  assert.equal((await late(request())).status, 409)
  const unconfigured = withScheduledExecution("billing-renewal", ok, {
    ...options,
    env: { ...env, SCHEDULER_INSTANCE: "" },
  })
  assert.equal((await unconfigured(request())).status, 503)
  assert.equal(state.opens, 0)
})

test("completed occurrences are not charged twice and refusal retries wait until the next day", async () => {
  const { state, options } = fixture()
  let calls = 0
  const handle = withScheduledExecution(
    "billing-renewal",
    async () => {
      calls++
      return Response.json({ failed: 1, errored: 0 })
    },
    options
  )
  assert.equal((await handle(request())).status, 200)
  assert.deepEqual(await (await handle(request())).json(), {
    skipped: "already_completed",
  })
  assert.equal(calls, 1)
  assert.equal(state.runs[0].status, "completed")
  const nextDay = withScheduledExecution(
    "billing-renewal",
    async () => {
      calls++
      return ok()
    },
    { ...options, now: () => new Date("2026-11-11T03:01:00Z") }
  )
  assert.equal((await nextDay(request())).status, 200)
  assert.equal(calls, 2)
})

test("overlapping executions never invoke the handler twice", async () => {
  const { options } = fixture()
  let release
  let began
  const entered = new Promise((resolve) => {
    began = resolve
  })
  const pending = new Promise((resolve) => {
    release = resolve
  })
  const handle = withScheduledExecution(
    "billing-renewal",
    async () => {
      began()
      await pending
      return ok()
    },
    options
  )
  const first = handle(request())
  await entered
  assert.equal((await handle(request())).status, 409)
  release()
  assert.equal((await first).status, 200)
})

test("an interrupted or partially failed occurrence blocks retries and later occurrences", async () => {
  for (const handler of [
    async () => {
      throw new Error("synthetic timeout")
    },
    async () => Response.json({ errored: 1 }),
    async () => Response.json({ pending: 1, errored: 0 }),
  ]) {
    const { state, options } = fixture()
    const handle = withScheduledExecution("billing-renewal", handler, options)
    assert.equal((await handle(request())).status, 503)
    assert.equal(state.runs[0].status, "reconciliation_required")
    const retry = withScheduledExecution(
      "billing-renewal",
      async () => {
        throw new Error("Must not execute")
      },
      { ...options, now: () => new Date("2026-11-11T03:01:00Z") }
    )
    assert.equal((await retry(request())).status, 409)
  }
})

test("lost completion write and host ownership transfer cannot reclaim a started occurrence", async () => {
  const { state, options } = fixture()
  state.failFinish = true
  assert.equal(
    (await withScheduledExecution("billing-renewal", ok, options)(request()))
      .status,
    503
  )
  assert.equal(state.runs[0].status, "running")
  state.owner = "vercel-production"
  const moved = withScheduledExecution("billing-renewal", ok, {
    ...options,
    env: { ...env, SCHEDULER_INSTANCE: state.owner },
  })
  assert.equal((await moved(request())).status, 409)
})

test("paused/wrong scheduler owner does not call the handler", async () => {
  const { state, options } = fixture()
  state.owner = null
  let calls = 0
  const response = await withScheduledExecution(
    "billing-renewal",
    async () => {
      calls++
      return ok()
    },
    options
  )(request())
  assert.equal(response.status, 409)
  assert.equal(calls, 0)
})

test("digest ledger failures and banking partial failures require reconciliation", async () => {
  for (const [job, summary, clock] of [
    [
      "monthly-digest",
      { sent: 1, failed: 0, reconciliationRequired: 1 },
      new Date("2026-11-01T06:01:00Z"),
    ],
    ["bank-sync", { inserted: 1, failed: 1 }, new Date("2026-11-10T04:01:00Z")],
  ]) {
    const { state, options } = fixture()
    const response = await withScheduledExecution(
      job,
      async () => Response.json(summary),
      { ...options, now: () => clock }
    )(request())
    assert.equal(response.status, 503)
    assert.equal(state.runs[0].status, "reconciliation_required")
  }
})

test("cron launcher is disabled by default, rejects unsafe origins and never follows redirects/retries", async () => {
  let calls = 0
  const fakeFetch = async (_url, init) => {
    calls++
    assert.equal(init.redirect, "error")
    assert.equal(init.headers.Authorization, "Bearer synthetic-secret")
    assert.equal(
      init.headers["X-Schedule-Occurrence"],
      "2026-11-10T03:00:00.000Z"
    )
    return new Response(null, { status: 503 })
  }
  assert.equal(
    (await runScheduled("billing-renewal", {}, fakeFetch, now)).event,
    "schedule.disabled"
  )
  const config = {
    ...env,
    SCHEDULER_ENABLED: "true",
    APP_ORIGIN: "https://test.example.invalid",
  }
  await assert.rejects(
    runScheduled(
      "billing-renewal",
      { ...config, APP_ORIGIN: "https://user:secret@example.invalid" },
      fakeFetch,
      now
    )
  )
  await assert.rejects(runScheduled("billing-renewal", config, fakeFetch, now))
  assert.equal(calls, 1)
})

test("host schedules agree and repository Git triggers cannot compete with controlled Railway releases", async () => {
  const vercel = JSON.parse(await readFile(new URL("../../vercel.json", import.meta.url), "utf8"))
  assert.ok(Object.values(vercel.git.deploymentEnabled).every((enabled) => enabled === false))
  assert.deepEqual(vercel.crons, Object.values(SCHEDULES).map(({ path, cron }) => ({ path, schedule: cron })))
})
