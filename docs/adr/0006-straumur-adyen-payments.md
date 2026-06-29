# Straumur/Adyen payments, self-owned subscription lifecycle

Premium is a monthly subscription (1990 ISK/mo, or annually at 30% off), so we need recurring billing. **Stripe is not available to merchants in Iceland**, so payments go through **Straumur** (whose online payments run on **Adyen**). Adyen gives tokenized recurring charges + webhooks but **no** Stripe-style hosted subscription manager, dunning, or customer portal — so we **own the subscription lifecycle ourselves**: store plan + renewal date + tokenized card in Neon, run a cron that charges renewals via Adyen, react to payment webhooks (success/failure/retry), and build our own in-app manage/cancel screen. The Plan lives on the Household.

## Consequences

- More billing plumbing than Stripe — budget explicitly for renewal scheduling and dunning/retry handling.
- This is driven by a regional constraint, not preference; "why not Stripe?" is answered here so it isn't re-proposed.
