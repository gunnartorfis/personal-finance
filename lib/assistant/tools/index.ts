import { compareCyclesTool } from "./compare-cycles";
import { cycleSummaryTool } from "./cycle-summary";
import { spendByTypeTool } from "./spend-by-type";
import { topMerchantsTool } from "./top-merchants";
import type { AssistantTool } from "./types";

export type { AssistantTool, AssistantToolContext } from "./types";

/**
 * The read-only Assistant tool set (#101, ADR-0018). Slice 3 adapts these into AI SDK tools. Grows
 * as later slices add search / trend / savings / health tools.
 */
export const assistantTools: ReadonlyArray<AssistantTool> = [
  cycleSummaryTool,
  spendByTypeTool,
  topMerchantsTool,
  compareCyclesTool,
];

export { compareCyclesTool, cycleSummaryTool, spendByTypeTool, topMerchantsTool };
