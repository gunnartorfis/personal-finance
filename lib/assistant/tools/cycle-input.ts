import { z } from "zod";

import { currentCycleKey, isValidCycleKey } from "@/lib/dashboard/cycle";

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
