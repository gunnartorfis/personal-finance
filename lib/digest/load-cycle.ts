import { eq } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"

import { loadCategoryBreakdown } from "@/lib/dashboard/category-breakdown"
import { currentCycleKey, cycleKeyRange, previousCycleKey } from "@/lib/dashboard/cycle"
import { loadDashboardView } from "@/lib/dashboard/dashboard-view"
import { householdRepo } from "@/lib/db/household-repo"
import { households } from "@/lib/db/schema"
import type * as schema from "@/lib/db/schema"
import { loadSavingsSnapshot } from "@/lib/savings/assessment"

import type { DigestCycleData } from "./run-monthly"

/**
 * Load one Household's Digest cycle data (#102, ADR-0019): the `loadCycle` dep the cron injects into
 * {@link runMonthlyDigest}. Reuses the dashboard view-model + savings snapshot so the Digest can
 * never disagree with the app, then extracts just the pieces the pure builder needs. Returns null
 * for an unknown Household. Loads the full trailing series (not a single cycle) so the assembler can
 * pick the closed cycle and its prior for the vs-last-month delta.
 *
 * Trade-off: this runs the whole dashboard pipeline (many queries — reconnect prompts, financial
 * health, budgets, …) though the Digest reads only series/categoryTrend/movers. Chosen for
 * correctness-by-reuse over a bespoke leaner query; if monthly cron latency becomes an issue, a
 * narrower loader is the optimization (a later slice), not a correctness fix.
 */
type Db = NodePgDatabase<typeof schema>

export async function loadDigestCycleData(db: Db, householdId: string, now: Date): Promise<DigestCycleData | null> {
  const [household] = await db
    .select({ plan: households.plan, billingCurrency: households.billingCurrency })
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1)
  if (!household) return null

  const repo = householdRepo(db, householdId)
  // The Digest covers the just-closed cycle; load that cycle's Category breakdown specifically (the
  // dashboard's own breakdown is a trailing window, wrong period here). Same cycle the assembler and
  // runMonthlyDigest derive from `now`, so they always agree.
  const closedCycle = previousCycleKey(currentCycleKey(now))
  const [view, snapshot, categoryBreakdown] = await Promise.all([
    loadDashboardView(repo, now, { plan: household.plan }),
    loadSavingsSnapshot(repo, now),
    loadCategoryBreakdown(repo, cycleKeyRange(closedCycle)),
  ])

  return {
    currency: household.billingCurrency,
    series: view.modules.series,
    categoryTrend: view.modules.categoryTrend,
    categoryBreakdown,
    categories: view.modules.categories,
    movers: view.modules.movers.merchants,
    savings: snapshot?.assessment ?? null,
  }
}
