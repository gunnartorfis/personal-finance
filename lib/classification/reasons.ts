/**
 * Canonical `reasoning` markers for classifications that did NOT come from a fresh model call.
 * Centralized so the drain (which writes them) and the reuse tally (which must exclude them) agree
 * on the exact strings — a drift would let reuse feed on its own output.
 */
export const CREDIT_REASON = "credit (not bucketed)";
export const MERCHANT_RULE_REASON = "merchant rule";
export const REUSED_REASON = "reused (merchant history)";

/**
 * Reasons produced by deterministic / derived paths (credit shortcut, Merchant rule, reuse). The
 * reuse tally counts only genuine model classifications, so these are excluded — otherwise a reused
 * row would reinforce the very majority it was copied from (a feedback snowball).
 */
export const DERIVED_REASONS = [CREDIT_REASON, MERCHANT_RULE_REASON, REUSED_REASON];
