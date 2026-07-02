# Reuse prior classifications instead of re-running the model

Every pending expense row currently costs one Sonnet call (ADR-0005), even when the same
merchant was already confidently classified — in the same upload or a previous one. On real
statements merchants repeat heavily (groceries, fuel, subscriptions), so most calls re-derive a
type the Household already has. We add **Classification reuse**: before calling the model for a
merchant, reuse the Expense type the Household's own prior AI **Classifications** gave that
merchant.

Reuse is only ever another **Classification** — same precedence level, still gated by and counted
against the **Free cap**. It draws on AI-classified rows only, never **Overrides** or **Merchant
rules**, so it introduces no new precedence layer and can only fill merchants a rule/override
hasn't already covered.

Two tiers, because within-upload consistency and cross-upload trust are different problems:

- **Within a run** — classify each distinct (normalized) merchant at most once per drain and reuse
  across that run, unconditionally. One upload of the same merchant is internally consistent and
  costs one call regardless of the model's confidence.
- **Across runs** — a merchant's prior classifications seed the cache only when confident: a prior
  row is cache-eligible at `confidence >= 0.7`. When eligible prior rows disagree (an
  amount-sensitive merchant the model split by charge size), **majority wins**; a tie falls back to
  the model.

Majority-wins is only safe because the wrong-type recovery paths actually work. **Override** already
does; **Merchant rules** did not (defined but unwired), so this change also finishes the ADR-0005
rules-first promise: rules are applied before the model/cache in the drain, and creating a rule
re-types existing matching rows (Overrides excepted).

## Considered Options

- **Unanimous-only reuse** — skip the cache whenever a merchant's history disagrees, so
  amount-sensitive merchants (gym membership vs drop-in) always re-run the model. Rejected: pays
  for the model on exactly the recurring merchants reuse targets. Majority-wins accepts the rare
  minority-amount miss, which an **Override** or an amount-split **Merchant rule** corrects.
- **No confidence floor** — reuse from the first classification regardless of confidence. Rejected:
  a single coin-flip guess becomes a permanent cross-upload cache entry.
- **Learn from Overrides** (reuse the effective type) — rejected: redefines Override (a
  per-single-transaction correction) and duplicates the Merchant rule, which already re-types all
  matching rows.
- **Reuse bypasses the Free cap** (count model calls, not classified rows) — rejected: the cap is a
  paywall on classified Transactions, not an inference-cost lever.

## Consequences

- Cost scales with distinct confident merchants, not row count.
- Majority-wins can entrench a wrong type for an amount-sensitive merchant until an Override or
  amount-split Merchant rule intervenes; the model will not self-correct it. Accepted.
- Overrides do not teach the cache — correcting a merchant everywhere still requires a Merchant
  rule. The Override UI nudges toward creating a rule.
- Merchant-rule and credit classifications skip the model and, like credits today, are not gated by
  the Free cap but do count toward it (consistent with existing credit handling).
- No schema change: a reused row is a normal `classified` Transaction (reasoning marks it as
  reused). The cache is recomputed per run from current classified rows, so it self-updates as
  history grows — no separate invalidation.
