# Household as the tenant boundary

This is personal finance, but spouses/families must share one combined financial picture — there's no point otherwise for married people. The tenant is therefore a **Household** (mapped to a Stack Auth Team), not a User: every financial row is keyed by `household_id`, one Household per user (v1), all Members equal (any can upload, edit, manage the subscription, invite/remove Members, delete the Household). A Member who leaves loses access; the Household's data stays with the rest.

## Considered Options

- **User-level ownership + ad-hoc sharing** — rejected: a couple's *combined* net is the product, so sharing is the default case, not an add-on; user-keyed data with a sharing layer is the wrong shape and more complex.

## Consequences

- The Free cap (50 classified) is per-Household, not per-user — otherwise a couple gets 100 by signing up twice.
- No automated data-split on divorce; the remedy is full household data export. Multi-household membership is deferred.
