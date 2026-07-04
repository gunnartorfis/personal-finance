import { z } from "zod";

import { cycleKeyRange } from "@/lib/dashboard/cycle";
import { buildTopMerchants, type MerchantSpend } from "@/lib/dashboard/top-merchants";

import { cycleKeySchema, resolveCycleKey } from "./cycle-input";
import type { AssistantTool } from "./types";

const topMerchantsSchema = z.object({
  cycle: cycleKeySchema.optional(),
  limit: z.number().int().min(1).max(20).optional(),
});
type TopMerchantsInput = z.infer<typeof topMerchantsSchema>;

/** The biggest merchants for a cycle. `merchant` is the normalized key; `share` is 0..1 of the total. */
export interface TopMerchantsResult {
  cycle: string;
  merchants: MerchantSpend[];
}

/** `topMerchants` — where the money went in a cycle, ranked. */
export const topMerchantsTool: AssistantTool<TopMerchantsInput, TopMerchantsResult> = {
  name: "topMerchants",
  description:
    "List the top merchants by spend for one statement cycle (YYYY-MM; omit for the current cycle), " +
    "up to `limit` (default 6). Each has its spend magnitude and share (0..1) of the cycle's total.",
  inputSchema: topMerchantsSchema,
  async run(ctx, input) {
    const cycle = resolveCycleKey(ctx, input.cycle);
    const rows = await ctx.repo.transactions.topMerchants(cycleKeyRange(cycle));
    return { cycle, merchants: buildTopMerchants(rows, input.limit ?? 6) };
  },
};
