/**
 * Assistant runtime configuration (#101, ADR-0022). Kept in one place so the model and the cost
 * guards are a one-line change. All tunable.
 */

/** The model that orchestrates tool-calling + narration, resolved by the Vercel AI Gateway (ADR-0005). */
export const ASSISTANT_MODEL = "anthropic/claude-sonnet-5";

/** Max steps in one tool-calling turn — bounds a single question's fan-out (cost + latency guard). */
export const ASSISTANT_MAX_STEPS = 6;

/** Soft per-Household daily cap on user messages (fair-use, Premium-only feature). */
export const ASSISTANT_DAILY_MESSAGE_CAP = 50;
