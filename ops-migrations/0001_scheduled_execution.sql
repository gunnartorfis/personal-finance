-- Infrastructure coordination only; financial schema remains owned by Drizzle.
-- Applied exclusively by the controlled release migration command.
CREATE SCHEMA IF NOT EXISTS hosting;

CREATE TABLE hosting.scheduled_jobs (
  name text PRIMARY KEY CHECK (name IN ('billing-renewal', 'bank-sync', 'monthly-digest')),
  owner text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hosting.scheduled_runs (
  id uuid PRIMARY KEY,
  job text NOT NULL REFERENCES hosting.scheduled_jobs(name),
  occurrence timestamptz NOT NULL,
  owner text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'reconciliation_required')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (job, occurrence)
);

CREATE INDEX scheduled_runs_unresolved ON hosting.scheduled_runs(job)
  WHERE status <> 'completed';

-- Paused by default. Ownership transfer is an explicit, reviewed cutover action.
INSERT INTO hosting.scheduled_jobs(name)
VALUES ('billing-renewal'), ('bank-sync'), ('monthly-digest');
