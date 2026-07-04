import { tool, type Tool } from "ai";

import { assistantTools } from "./tools";
import type { AssistantToolContext } from "./tools/types";

/**
 * Adapt the read-only {@link assistantTools} into AI SDK tools bound to one request's
 * {@link AssistantToolContext} (#101, ADR-0018). Each tool keeps its zod `inputSchema`; `execute`
 * closes over the tenant-scoped context and delegates to the tool's `run`. Keyed by tool name — the
 * key the model calls.
 */
export function toAiTools(ctx: AssistantToolContext): Record<string, Tool> {
  return Object.fromEntries(
    assistantTools.map((t) => [
      t.name,
      tool({
        description: t.description,
        inputSchema: t.inputSchema,
        execute: (input) => t.run(ctx, input),
      }),
    ]),
  );
}
