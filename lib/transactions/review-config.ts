/**
 * Rapid-review confidence ceiling: a classified expense whose AI confidence is *below* this value is
 * surfaced for human review alongside the still-unclassified backlog. Rows at or above it are trusted
 * and stay settled. Deliberately the same value as {@link REUSE_CONFIDENCE_FLOOR} — a classification
 * too weak to seed cross-run reuse is exactly the one worth a human glance — but kept as its own
 * constant so the two concerns can diverge without silently changing the other.
 *
 * Shared by the server queries (`reviewQueue`/`reviewQueueMonths`) and the client queue builder, so
 * the badge count, the fetched rows, and the on-device filter all agree on what "worth reviewing"
 * means. `confidence` is a 0..1 float; null (credits, pending/failed) never satisfies `< ceiling`.
 */
export const REVIEW_CONFIDENCE_CEILING = 0.7
