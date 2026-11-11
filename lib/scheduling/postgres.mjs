/**
 * Serialize claims by locking one job-control row briefly, then persist running intent before
 * any external effect. Works with transaction-pooled Neon endpoints: no session locks/leases.
 * An unresolved run blocks later occurrences too, so a lost worker cannot overlap a new one.
 */
export function postgresCoordinator(client) {
  return {
    async claim(job, occurrence, owner, runId) {
      await client.query("BEGIN")
      try {
        const control = await client.query(
          "SELECT owner FROM hosting.scheduled_jobs WHERE name = $1 FOR UPDATE",
          [job]
        )
        if (control.rows[0]?.owner !== owner) {
          await client.query("ROLLBACK")
          return "scheduler_not_owner"
        }
        const unresolved = await client.query(
          "SELECT id FROM hosting.scheduled_runs WHERE job = $1 AND status <> 'completed' LIMIT 1",
          [job]
        )
        if (unresolved.rows.length) {
          await client.query("ROLLBACK")
          return "reconciliation_required"
        }
        const inserted = await client.query(
          `INSERT INTO hosting.scheduled_runs(id, job, occurrence, owner, status)
           VALUES ($1, $2, $3, $4, 'running') ON CONFLICT (job, occurrence) DO NOTHING RETURNING id`,
          [runId, job, occurrence, owner]
        )
        await client.query("COMMIT")
        return inserted.rows.length ? "started" : "already_completed"
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {})
        throw error
      }
    },
    async finish(runId, status) {
      if (!["completed", "reconciliation_required"].includes(status))
        throw new Error("Invalid run state")
      const result = await client.query(
        "UPDATE hosting.scheduled_runs SET status = $2, finished_at = now() WHERE id = $1 AND status = 'running' RETURNING id",
        [runId, status]
      )
      if (result.rows.length !== 1)
        throw new Error("Run is not owned by this execution")
    },
    close: () => client.end(),
  }
}

export async function openCoordinator(connectionString) {
  const { Client } = await import("pg")
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
  })
  // An idle connection failure must not crash the app. The durable running row stays fenced.
  client.on("error", () => {})
  try {
    await client.connect()
  } catch (error) {
    await client.end().catch(() => {})
    throw error
  }
  return postgresCoordinator(client)
}
