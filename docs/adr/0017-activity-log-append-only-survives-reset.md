# Activity log: append-only member action record that survives data reset

Issue #107 (Trust) calls for an audit trail. We build a **member-facing Activity log** — the
Household's record of *who did what, when* — not a compliance/forensics log: it records every
Member-initiated mutation (Transaction edits, Uploads, Account / Merchant-rule changes, Invites and
membership, savings/budget config, billing, data export, data reset) and deliberately **excludes
system work** (Sync runs, AI Classification) and auth events (those live with Neon Auth). Every
Member of the Household reads the whole log; the point is transparency between partners sharing one
financial picture.

The log is **append-only** (ADR-0003 spirit — entries are never edited or deleted while the
Household exists) and, surprisingly, **survives the household data reset** that wipes every other
financial table: a reset that also erased the log would let one partner destroy the evidence of
their edits — the exact failure the Trust feature exists to prevent. The reset itself is a logged
action. The log is removed only when the Household itself is deleted (FK cascade on `households`).

Consequences that follow: entries carry **no foreign keys to financial rows** (transactions,
uploads, accounts may be deleted out from under them by a reset) — they reference entities by id +
summary inside a payload instead; and each entry keeps a **denormalized actor-name snapshot**
alongside the member id, so a departed Member's history stays attributed and readable after their
member row is gone. Anonymizing a leaver's entries was rejected — it erases the "who" the log
exists for, and legitimate interest covers keeping it.

Rejected alternatives: a security/compliance log (auth events are Neon Auth's, not ours; different
audience), logging system events with a "system" actor (sync noise dwarfs human actions), reset
wiping the log (defeats the purpose), and capturing events by auto-instrumenting the repo layer
(emits table-level noise like "overrides.updated"; only the route/domain layer knows the intent —
events are recorded explicitly at intent level, e.g. "transaction excluded").
