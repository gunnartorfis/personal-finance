import { defineRailway, project, service } from "railway/iac"

import { SCHEDULES } from "../lib/scheduling/execution.mjs"

// Draft until SDK installation, lockfile generation and `railway config plan` are verified.
// No GitHub source: CI owns deploys; Vercel remains available until accepted cutover.
export default defineRailway((ctx) => {
  if (ctx.projectId !== "2c2ceec6-dacc-4c72-9f2a-fc1f980d57ec") {
    throw new Error("Personal Finance GA Solutions project required")
  }
  if (ctx.environment !== "production") {
    throw new Error("Personal Finance uses production only")
  }
  return project("Personal Finance", {
    resources: [
      service("web", {
        healthcheck: "/api/health",
        healthcheckTimeout: 120,
        replicas: 1,
        deploy: {
          restartPolicyType: "ON_FAILURE",
          restartPolicyMaxRetries: 3,
          drainingSeconds: 320,
        },
        env: {
          NODE_ENV: "production",
          TZ: "UTC",
          HOSTNAME: "0.0.0.0",
          APP_ORIGIN: "https://web-production-a5531.up.railway.app",
          SCHEDULER_INSTANCE: "railway-production",
        },
      }),
      ...Object.entries(SCHEDULES).map(([job, schedule]) =>
        service(`scheduler-${job}`, {
          start: `node scripts/hosting/run-scheduled.mjs ${job}`,
          deploy: { cronSchedule: schedule.cron, restartPolicyType: "NEVER" },
          env: { TZ: "UTC", SCHEDULER_ENABLED: "false" },
        })
      ),
    ],
  })
})
