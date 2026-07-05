import { compareCyclesTool } from "./compare-cycles";
import { cycleSummaryTool } from "./cycle-summary";
import { financialHealthTool } from "./financial-health";
import { savingsStatusTool } from "./savings-status";
import { searchTransactionsTool } from "./search-transactions";
import { spendByTypeTool } from "./spend-by-type";
import { spendingTrendTool } from "./spending-trend";
import { topMerchantsTool } from "./top-merchants";
import type { AssistantTool } from "./types";

export type { AssistantTool, AssistantToolContext } from "./types";

/**
 * The read-only Assistant tool set (#101, ADR-0022). Slice 3 adapts these into AI SDK tools. Every
 * tool is a thin, tenant-scoped wrapper over tested `lib/dashboard/*` / `lib/savings/*` helpers.
 */
export const assistantTools: ReadonlyArray<AssistantTool> = [
  cycleSummaryTool,
  spendByTypeTool,
  topMerchantsTool,
  compareCyclesTool,
  searchTransactionsTool,
  spendingTrendTool,
  savingsStatusTool,
  financialHealthTool,
];
