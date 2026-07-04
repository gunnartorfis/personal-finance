# Outbound email digests: Resend, opt-out, computed-not-AI, read-only

Issue #102 (retention theme) asks for scheduled email/push summaries, anomaly nudges, and a
year-in-review, "generated from the dashboard view-model", to give a pull-only app a reason to
return between uploads. The v1 slice is a **Monthly digest** (see CONTEXT.md **Digest**): a
per-**Member** email, in each Member's own **Locale**, summarizing the just-closed **Statement
cycle** (Spending, Income (marked), expense-type split, top movers, and — when a **Savings goal**
exists — On track / behind + next cycle's **Allowed nice-to-have**). It is sent by a monthly Vercel
cron (the same `CRON_SECRET` Bearer pattern as `/api/billing/renew` and `/api/open-banking/sync`),
for the previous calendar month, skipping any Household with no Transactions in that cycle, and
deduped by an append-only sent-ledger keyed by (Member, cycle) so a retry or double-run can never
double-send (one email per Member, so the key is per-Member, not per-Household).

Four coupled choices:

- **Email only** (push deferred). Email is the canonical "pull-only → reason to return" channel and
  needs only a verified sender domain, versus web push's service-worker/VAPID/subscription-storage
  surface. Push is a later issue.
- **Resend** as the provider. Vercel-native, first-class React Email templating (the app already
  renders in React/Tailwind), simplest domain verification. Postmark (pricier, separate templating)
  and SES (cheapest at scale, most setup friction) were the alternatives.
- **On by default (opt-out)**, verified-email Members only, with a one-click auth-less unsubscribe
  link in every email plus a settings toggle; preference stored per Member. The body is the Member's
  own household financial summary (legitimate-interest service mail, not marketing-to-sell), and
  opt-out is what actually delivers the retention goal.
- **Computed figures only — no LLM call.** The digest body is a pure function of the `lib/dashboard/*`
  view-model, so it obeys every net rule (ADR-0009/0011/0014/0015) for free, never invents a number,
  and costs nothing per send. "Insight-flavored" callouts are templated strings over `movers.ts` /
  `spending-trend.ts`. All copy comes from the message catalogs like the rest of the UI.

The Digest is **read-only** in the strong sense (like the **Assistant**, ADR-0022): it never mutates
household data, never creates a **Check-in** (which stays a deliberate Member action that freezes a
snapshot), and writes no **Activity log** entry. Available to Free and Premium alike — retention is
most valuable for the churning Free cohort, and there is no per-send cost to gate.

## Considered Options

- **Push (or email+push) for v1** — rejected: web push's infra (service worker, VAPID keys,
  per-browser permission prompts, subscription storage) is a large surface to stand up before we
  know digests land. Email verifies the retention bet with the smallest footprint.
- **Weekly digest** — rejected: the entire time axis is the monthly **Statement cycle**; there is no
  weekly bucket, and **Inferred saving** deliberately excludes the in-progress cycle because
  mid-period it shows full income against near-zero spend. A weekly email would surface exactly those
  misleading mid-cycle figures. Anomaly nudges (event-driven) and year-in-review (annual, 12mo
  history) are deferred as heavier follow-ups.
- **Data-triggered send** (fire when a cycle's data looks "complete") — rejected: completeness is
  undefinable for CSV **Uploads** (statements lag arbitrarily), so it risks firing mid-cycle or never.
  A fixed calendar cron that skips empty cycles is predictable; a late uploader simply misses that
  month (a nudge, not a guarantee).
- **Explicit opt-in** — rejected: safest legally but almost nobody flips the toggle, which defeats the
  feature. Opt-out with a frictionless unsubscribe is the defensible middle for own-data service mail.
- **AI-narrated digest** — rejected for v1: a monthly per-Household LLM call is recurring cost +
  hallucination risk + a fresh localization decision, for prose over numbers the view-model already
  computes. Can be layered on the Assistant's tool infra later.
- **Digest performs the Check-in** — rejected: it would turn a "records people only" concept into
  system work, freeze snapshots from possibly-incomplete data, and break the read-only posture.
- **Premium-gated** — rejected: points the retention feature away from the cohort most likely to churn.

## Consequences

- A new outbound-email trust surface + a verified sender domain must be provisioned before the
  feature can ship — this is the deliberate product/infra step the issue was deferred on. Sender:
  `Auratal <no-reply@auratal.is>`; requires a Resend account, `RESEND_API_KEY` in Vercel, and
  verified DNS for `auratal.is`. The monthly cron runs `0 6 1 * *` (06:00 UTC, 1st).
- The digest and the dashboard can never disagree on a figure (same code paths), and adding a new
  digest line means calling an existing view-model helper, not prompt-tuning.
- Digest copy needs matching `en`/`is` catalog keys like any UI string; unlike Classification
  `reasoning` it is fully localized, because it is chrome, not AI-generated data.
- The cron enumerates Members across all Households and resolves email + verification via the
  `neon_auth.users_sync` mirror (as `lib/household/members-view.ts` already does) joined to the
  per-Member `locale` and the new opt-out preference.
- Adding weekly digests, anomaly nudges, year-in-review, or a push channel later reuses this
  provider, sent-ledger, preference, and per-Member-locale rendering scaffold.
