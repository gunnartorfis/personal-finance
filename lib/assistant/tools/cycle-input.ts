import { z } from "zod";

import { currentCycleKey, cycleKeyRange, isValidCycleKey } from "@/lib/dashboard/cycle";
import { loadConfiguredAmounts } from "@/lib/dashboard/configured-amounts";
import { addConfiguredAmounts, loadNetSummary, type NetSummary } from "@/lib/dashboard/net-summary";

import type { AssistantToolContext } from "./types";

/** A statement-cycle key (`YYYY-MM`) the model may pass; validated to the real cycle format. */
export const cycleKeySchema = z
  .string()
  .refine(isValidCycleKey, { message: "cycle must be a YYYY-MM key, e.g. 2026-03" });

/** Shared input for per-cycle tools: omit `cycle` to mean the current statement cycle. */
export const optionalCycleSchema = z.object({ cycle: cycleKeySchema.optional() });
export type OptionalCycleInput = z.infer<typeof optionalCycleSchema>;

/** The requested cycle, or the current one (derived from the injected `now`) when omitted. */
export function resolveCycleKey(ctx: AssistantToolContext, cycle?: string): string {
  return cycle ?? currentCycleKey(ctx.now);
}

/** Positive magnitude of a spend figure (helpers store debits as `<= 0`); normalizes `-0` to `0`. */
export function magnitude(value: number): number {
  return Math.abs(value);
}

/**
 * A cycle's {@link NetSummary} WITH the household's configured Monthly income + Off-card fixed costs
 * folded in (ADR-0015) — exactly what the Transactions overview shows (`addConfiguredAmounts`). Using
 * this (not raw `loadNetSummary`) keeps the Assistant's figures identical to that view for households
 * that configure off-card amounts. Households with none resolve to zeros, so nothing changes for them.
 */
export async function loadCycleSummary(ctx: AssistantToolContext, cycle: string): Promise<NetSummary> {
  const [base, configured] = await Promise.all([
    loadNetSummary(ctx.repo, cycleKeyRange(cycle)),
    loadConfiguredAmounts(ctx.repo, cycle),
  ]);
  return addConfiguredAmounts(base, configured);
}

/**
 * Spend magnitude of the rows no bucket claims: the explicit `""` type plus rows with no effective
 * type. `addConfiguredAmounts` never touches these, so it reads the same folded or raw.
 */
export function unclassifiedMagnitude(summary: NetSummary): number {
  return magnitude(summary.unclassified + summary.byExpenseType[""]);
}
