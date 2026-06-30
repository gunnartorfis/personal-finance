import { generateObject } from "ai";
import { z } from "zod";

import { RULES_PROMPT } from "@/shared/rules";

import type { Classifier } from "./worker";

/**
 * The real classifier (ADR-0005): classifies an expense Transaction with Sonnet 5 through the
 * Vercel AI Gateway (the `"anthropic/claude-sonnet-5"` model string is resolved by the gateway,
 * authed via AI_GATEWAY_API_KEY / Vercel OIDC). The system prompt is the shared rules prompt; the
 * model returns a structured Expense type plus calibrated confidence and a short reasoning.
 *
 * Only expense rows reach here — the worker handles credits as not-bucketed without a model call.
 */
export const SONNET_MODEL = "anthropic/claude-sonnet-5";

const ClassificationSchema = z.object({
  expenseType: z.enum(["Fixed", "Necessary", "Nice to have", ""]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(200),
});

/** Build a {@link Classifier} backed by Sonnet 5 via the AI Gateway. */
export function sonnetClassifier(): Classifier {
  return async (txn) => {
    const { object } = await generateObject({
      model: SONNET_MODEL,
      schema: ClassificationSchema,
      system: RULES_PROMPT,
      prompt: [
        "Classify this transaction into exactly one spending type.",
        `Merchant: ${txn.merchant}`,
        `Amount (ISK; negative = expense): ${txn.amount}`,
        `Category hint: ${txn.rawCategory}`,
        `Date: ${txn.date}`,
      ].join("\n"),
    });
    return object;
  };
}
