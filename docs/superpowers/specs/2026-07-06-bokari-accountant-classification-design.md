# Bókari — accountant bulk-classification tool (design)

Date: 2026-07-06
Status: approved design, pre-implementation

## Summary

A B2B surface inside the finance app for Icelandic bookkeeping/accounting
firms: client bank/card statements in (CSV/Excel), AI pre-classifies each
line to the firm's own chart of accounts (bókhaldslyklar) plus a suggested
VSK treatment, a bookkeeper reviews and corrects in a keyboard-first grid,
and the result exports as CSV/Excel for import into dk/Payday/Regla.

Bókari is a **pre-processor, not a ledger**: no double-entry, no balances.
Working name only; rename before launch.

## Goal & rationale

- Primary goal: near-term revenue (chosen over seed-story-first).
- Icelandic consumers don't pay for PFM (bank apps + Meniga heritage set the
  "free" expectation), so B2C Premium is the weakest revenue path. Firms pay
  for pain today: statement coding is junior-hour margin leak at firms
  billing ~15–25k ISK/hr.
- Reuses the codebase's two hardest-won assets nearly verbatim: magical CSV
  import (ADR-0018) and cached AI classification (ADR-0005, ADR-0012).

## Commercial plan

- **Pilot**: one warm-intro firm, free for 2 months.
  Success = firm processes ≥ 3 real clients, month-2 auto-accept rate
  materially above month-1, and they'd pay rather than lose it.
- **Pricing after pilot**: per-client-per-month, order of magnitude
  ~1.500 ISK/client/mo; no seat fees. Pilot calibrates the level.
- **Moat / learning loop**: every correction writes the firm-scoped
  merchant → (chart key, VSK code) cache. Month 2 needs dramatically less
  review than month 1. The auto-accept-rate improvement is both the product
  value and the sales metric.

## Product identity: separate brand, shared codebase

- **Separate brand**: own name, domain, and landing page. The accountant
  buyer must never land on couples' budgeting marketing; tone and pricing
  are B2B. Keeps the B2C story clean too.
- **Shared codebase**: reuse is the whole economic case (CSV import engine,
  classification worker + cache, i18n, auth, billing rails, activity log).
  Extracting to a second repo/shared package costs weeks before the first
  pilot statement is processed.
- **Mechanics**: second domain on the same Vercel project; host-based
  routing in middleware (`bokari.is` → firm surface, finance domain →
  household app). Each domain sees only its own marketing + auth entry.
- **Split trigger**: extract to its own repo/product only if the pilot
  converts and Bókari becomes the revenue engine. Firm-tenant isolation
  (separate tables, zero Household entanglement) makes that a lift-out,
  not surgery.
- **Accepted cost meanwhile**: shared deploys — a household-app regression
  can block a Bókari deploy and vice versa. Fine at pilot scale.

## Tenancy & data model

- New `Firm` tenant, parallel to Household (ADR-0002 spirit, zero
  entanglement). Hierarchy: Firm → Members (bookkeepers) → Clients →
  Accounts.
- Separate tables from household transactions; same append-only idempotent
  ingestion pattern (ADR-0003).
- A user may hold both a Household and a Firm membership — separate
  membership tables, no interaction.
- **Chart of accounts**: uploaded once per firm as CSV (key number, name,
  optional default VSK code); per-client override allowed. Upload goes
  through the same column-mapping UI as statements.
- **Counter-account**: a fixed per-Account chart key, set once on the
  Account, emitted as a column in exports.

## Reused wholesale

- Magical CSV import: column mapping, heuristics, AI fallback,
  remembered-mappings-by-file-shape (ADR-0018). A bank's statement format is
  taught once per shape, then imports silently.
- Background classification worker + Sonnet via AI Gateway (ADR-0005).
- Merchant cache (ADR-0012), re-scoped to
  `(firm, merchant) → chart key + VSK code`.
- i18n system (both catalogs, per CLAUDE.md), Neon Auth, Straumur billing
  rails (wired post-pilot), activity log.

## New components

1. **Chart of accounts entity + upload flow** — mapping UI reuse; stores
   key number, name, default VSK.
2. **Review grid** (the core screen) — keyboard-first table over a
   statement's classified lines. Actions: accept line, correct key
   (typeahead over the chart), correct VSK, bulk-accept all lines for a
   merchant. High-confidence lines arrive pre-accepted; low-confidence
   arrive flagged. Every correction writes the firm cache.
3. **Export builder** — CSV/Excel with columns: date, description/merchant,
   amount, chart key number, key name, VSK code, counter-account key, note.
   Export allowed anytime; unresolved flags are warnings, not blockers.

## Flow

Onboard firm → add client → upload chart → upload statement → background
classification (firm cache first, AI fallback with the chart in the prompt)
→ review grid → export.

## Classification

- Cache hit → apply cached key + VSK, mark high-confidence.
- Cache miss → AI call with the client's effective chart (per-client
  override else firm chart) in the prompt; returns key + VSK + confidence.
- AI failure → line lands flagged-unclassified; import never blocks.
- Nothing exports as "AI decided" without the grid having shown it —
  every suggestion is reviewable.

## v1 cutlines (explicit)

- No direct dk/Payday/Regla API push (v2; pilot tells us which system).
- No PDF parsing — CSV/Excel statements only.
- No receipts/attachments, no bank sync, no double-entry.
- No FX — charged ISK amounts only.
- No billing automation — pilot is free; Straumur wiring after pilot
  converts.

## Error handling

- Bad chart/statement file → same import-preview stop-and-fix pattern as
  the household app.
- Re-uploads dedupe idempotently (ADR-0003 pattern).
- AI/service failure degrades to flagged-unclassified lines, never a
  blocked import.

## Testing

- Golden-file tests for export output.
- Unit tests: classification mapping (cache hit, AI fallback), chart
  typeahead, VSK suggestion handling.
- `renderWithIntl` for grid UI; TypeScript must compile clean (global rule).
- Pilot is the acceptance test; instrument % lines auto-accepted and
  corrections per 100 lines, month 1 vs month 2.

## Unresolved questions

- Real name + domain (Bókari is placeholder).
- Pilot firm's ledger system (dk/Payday/Regla?) — sets v2 integration
  target and exact export column expectations.
- VSK edge cases the pilot firm cares about (reverse charge, mixed-rate
  merchants) — collect during pilot, don't pre-build.
