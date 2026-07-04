import type { z } from "zod";

import type { HouseholdRepo } from "@/lib/db/household-repo";

/**
 * Assistant tool layer (#101, ADR-0022). Each tool is a thin, READ-ONLY wrapper over the tested
 * `lib/dashboard/*` helpers and `householdRepo`, so its numbers obey the same net rules
 * (ADR-0009/0011/0014/0015) the dashboard uses — the model orchestrates, the tools are ground truth.
 *
 * Kept independent of the AI SDK in this slice: a tool is `{ name, description, inputSchema, run }`.
 * Slice 3 adapts each into an AI SDK `tool({ inputSchema, execute })` by closing `run` over the
 * per-request {@link AssistantToolContext}.
 */

/** Per-request context every tool runs against — the tenant-scoped repo and a fixed "now". */
export interface AssistantToolContext {
  /** Household-scoped data access; the tenant boundary. */
  repo: HouseholdRepo;
  /**
   * The reference instant for resolving the current/relative cycle. Injected (never read from the
   * clock inside a tool) so behavior is deterministic and testable.
   */
  now: Date;
}

/** A single read-only assistant tool. `Input` is validated by `inputSchema` before `run`. */
export interface AssistantTool<Input = unknown, Output = unknown> {
  /** Stable tool name exposed to the model (snake_case-free camelCase, matches the AI SDK key). */
  readonly name: string;
  /** One-line description the model sees; says what it answers and in what units. */
  readonly description: string;
  /** Zod schema for the model-supplied arguments. */
  readonly inputSchema: z.ZodType<Input>;
  /** Execute the read against the tenant-scoped context; returns a JSON-serializable result. */
  run(ctx: AssistantToolContext, input: Input): Promise<Output>;
}
