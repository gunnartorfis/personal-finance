import type { CategoryTrendPoint } from "@/lib/dashboard/category-trend"
import { currentCycleKey, previousCycleKey, type CycleKey } from "@/lib/dashboard/cycle"
import type { MonthlySpendPoint } from "@/lib/dashboard/monthly-series"
import type { Mover } from "@/lib/dashboard/movers"
import type { EmailSender } from "@/lib/email/resend"
import { defaultLocale } from "@/lib/i18n/config"
import type { SavingsAssessment } from "@/lib/savings/assessment"

import { buildMonthlyDigest, type MonthlyDigestInput } from "./build-monthly"
import { renderMonthlyDigestEmail } from "./email/render"
import type { HouseholdDigestRecipients } from "./recipients"

/** The just-closed cycle's pieces for one Household, loaded by the caller. */
export interface DigestCycleData {
  currency: string
  series: MonthlySpendPoint[]
  categoryTrend: CategoryTrendPoint[]
  movers: Mover[]
  savings: SavingsAssessment | null
}

const EMPTY_BY_TYPE: CategoryTrendPoint["byExpenseType"] = { Fixed: 0, Necessary: 0, "Nice to have": 0, "": 0 }

/** Adapt one Household's loaded cycle data into the pure builder's input for a given cycle. */
export function assembleDigestInput(data: DigestCycleData, cycleKey: CycleKey): MonthlyDigestInput {
  const cycle = data.series.find((p) => p.month === cycleKey) ?? {
    month: cycleKey,
    spending: 0,
    income: 0,
    difference: 0,
  }
  const priorKey = previousCycleKey(cycleKey)
  const priorCycle = data.series.find((p) => p.month === priorKey) ?? null
  const byExpenseType = data.categoryTrend.find((p) => p.month === cycleKey)?.byExpenseType ?? EMPTY_BY_TYPE

  return {
    cycleKey,
    currency: data.currency,
    cycle,
    priorCycle,
    byExpenseType,
    movers: data.movers,
    savings: data.savings ? { onTrack: data.savings.onTrack, allowedNiceToHave: data.savings.allowedNiceToHave } : null,
  }
}

/** Everything {@link runMonthlyDigest} needs — all injected, so the orchestration is DB-free to test. */
export interface MonthlyDigestDeps {
  now: Date
  from: string
  dashboardUrl: string
  send: EmailSender
  listRecipients: () => Promise<HouseholdDigestRecipients[]>
  /**
   * Load a Household's trailing cycle data, or null when the Household has no data. Takes only the
   * Household id: it returns the full trailing series and the assembler picks the closed cycle + its
   * prior, so the loader never needs the cycle key (the `now`-relative window already contains it).
   */
  loadCycle: (householdId: string) => Promise<DigestCycleData | null>
  /** True when this Member was already sent the Digest for this cycle (ledger dedup). */
  hasSent: (memberId: string, cycleKey: CycleKey) => Promise<boolean>
  /** Record a successful send in the append-only ledger. */
  recordSent: (householdId: string, memberId: string, cycleKey: CycleKey) => Promise<void>
  /** The auth-less unsubscribe link for a Member (signed token wired in slice 6). */
  unsubscribeUrlFor: (memberId: string) => string
}

export interface DigestRunSummary {
  cycleKey: CycleKey
  households: number
  sent: number
  /** Members skipped because their Household had no activity in the cycle (no empty digest). */
  skippedEmpty: number
  /** Members skipped because the ledger already had a send for this cycle. */
  skippedAlreadySent: number
  /** Members whose send failed (transport error / refusal); no ledger row written, retried next run. */
  failed: number
}

/**
 * Send the Monthly Digest for the just-closed cycle to every eligible Member (#102, ADR-0019).
 * Read-only over household data (mutates nothing but the send-ledger). Per Household it loads the
 * closed cycle once, skips it when there is no activity (no empty digest), then for each Member
 * dedups against the ledger, renders in that Member's Locale, sends, and records only on success —
 * so a failed send simply retries next run and a rerun never double-sends.
 */
export async function runMonthlyDigest(deps: MonthlyDigestDeps): Promise<DigestRunSummary> {
  const cycleKey = previousCycleKey(currentCycleKey(deps.now))
  const households = await deps.listRecipients()

  let sent = 0
  let skippedEmpty = 0
  let skippedAlreadySent = 0
  let failed = 0

  for (const household of households) {
    // Isolate each Household: a flaky loadCycle (or any throw) must not abort the whole batch and
    // starve every later Household — bound the blast radius to this one.
    try {
      const data = await deps.loadCycle(household.householdId)
      const model = data ? buildMonthlyDigest(assembleDigestInput(data, cycleKey)) : null
      if (!model || !model.hasActivity) {
        skippedEmpty += household.members.length
        continue
      }

      for (const member of household.members) {
        try {
          if (await deps.hasSent(member.memberId, cycleKey)) {
            skippedAlreadySent += 1
            continue
          }
          const { subject, html } = renderMonthlyDigestEmail({
            model,
            locale: member.locale ?? defaultLocale,
            unsubscribeUrl: deps.unsubscribeUrlFor(member.memberId),
            dashboardUrl: deps.dashboardUrl,
          })
          const result = await deps.send.send({ from: deps.from, to: member.email, subject, html })
          if (!result.ok) {
            failed += 1
            continue
          }
          // The email landed — count it as sent regardless of what the ledger write does next.
          sent += 1
          try {
            await deps.recordSent(household.householdId, member.memberId, cycleKey)
          } catch (error) {
            // Delivered but the ledger write failed: a rerun may re-send this one Member. Better than
            // aborting the batch; log and move on (at-most-once degrades to at-least-once only here).
            console.error(`[digest] recordSent failed for member ${member.memberId} cycle ${cycleKey}`, error)
          }
        } catch (error) {
          console.error(`[digest] send failed for member ${member.memberId} cycle ${cycleKey}`, error)
          failed += 1
        }
      }
    } catch (error) {
      console.error(`[digest] household ${household.householdId} failed for cycle ${cycleKey}`, error)
      failed += household.members.length
    }
  }

  return { cycleKey, households: households.length, sent, skippedEmpty, skippedAlreadySent, failed }
}
