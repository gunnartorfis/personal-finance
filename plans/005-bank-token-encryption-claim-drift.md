# Plan 005: Fix the "encrypted at rest" decision drift on bank-connection tokens

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a1ed56c..HEAD -- lib/db/schema.ts lib/db/household-repo.ts lib/open-banking/connect.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW — comment corrections plus additive type/runtime tests; no behavior change.
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `a1ed56c`, 2026-07-04

## Why this matters

The schema and repo claim a token-encryption layer that does not exist. `lib/db/schema.ts`
documents `bank_connections` as holding "the aggregator tokens (encrypted at rest by the
app layer)" and its `accessToken`/`refreshToken` columns as "ciphertext (encrypted at rest
by the app layer)"; `lib/db/household-repo.ts` says tokens "must be written only as
ciphertext via the encrypted write path introduced with the connect flow (#113)". No
encryption/decryption code exists anywhere in `lib/` or `app/` (grep for
cipher/encrypt/decrypt finds only these comments and the unrelated export-strip code). The
*actual* security posture is different — and defensible: `accessToken`/`refreshToken` are
**never written at all** (the repo's insert/update types `Omit` them, so no write path
exists), and the live consent handle (`providerConnectionId` = the Enable Banking session
id) is stored plaintext but is unusable without the app's RSA private key + application id.
A reviewer or future contributor reading the current comments will (a) believe protection
exists that doesn't, and (b) potentially add a raw-token write "matching" a phantom
encrypted path. This plan makes the code tell the truth and pins the never-written
invariant with tests, so the claim can't silently rot again.

This is a decision-drift fix, not an encryption project. Real app-layer encryption becomes
worthwhile only if bearer tokens are ever actually persisted — that decision is explicitly
deferred (see Maintenance notes).

## Current state

- `lib/db/schema.ts` — the `bankConnections` table doc (~line 158) and column comment
  (~line 180):

  ```ts
  /**
   * A Household's authorized link to one bank via an open-banking aggregator (Enable Banking). Holds
   * the PSD2 consent (which expires — SCA re-consent ~every 90 days) and the aggregator tokens
   * (encrypted at rest by the app layer). One connection exposes one or more {@link accounts}.
   */
  ...
  /** Aggregator access/refresh tokens; ciphertext (encrypted at rest by the app layer). */
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  ```

- `lib/db/household-repo.ts` (~line 351) — the stale claim above `bankConnections.create`:

  ```ts
  // Tokens (accessToken/refreshToken) are intentionally NOT settable here: they must be written
  // only as ciphertext via the encrypted write path introduced with the connect flow (#113), so
  // this slice exposes no way to persist a raw bearer token.
  create: (
    value: Omit<
      typeof bankConnections.$inferInsert,
      "householdId" | "accessToken" | "refreshToken"
    >
  ) => ...
  ```

  (The `Omit` is real and correct — the *comment's* "encrypted write path" is fiction; no
  such path was ever introduced.) The `update` method has an equivalent restriction —
  verify its exact `Omit`/`Pick` shape when you open the file.

- `lib/open-banking/connect.ts:30-60` — persists `providerConnectionId: session.sessionId`
  (the live consent handle) in plaintext via `repo.bankConnections.create/update`. This
  stays as-is; the fix is honest documentation, not encrypting this handle today.

- Existing test exemplar: `lib/db/schema.bank-connections.test.ts` (pglite-backed schema
  tests) — extend it.

## Commands you will need

| Purpose   | Command                                        | Expected on success |
|-----------|------------------------------------------------|---------------------|
| Install   | `pnpm install`                                 | exit 0              |
| Typecheck | `pnpm typecheck`                               | exit 0, no errors   |
| Tests     | `pnpm test:run lib/db/schema.bank-connections` | all pass            |
| Full tests| `pnpm test:run`                                | all pass            |
| Lint      | `pnpm lint`                                    | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `lib/db/schema.ts` (comments only — no column/DDL changes)
- `lib/db/household-repo.ts` (comments only — no type/behavior changes)
- `lib/db/schema.bank-connections.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- `lib/open-banking/connect.ts` — plaintext consent-handle storage is the accepted posture
  being documented; do not add encryption.
- Any drizzle migration under `drizzle/` — no schema change happens here.
- `lib/household/export.ts` / `app/api/export/route.ts` — the GDPR export already strips
  connection tokens; unrelated.
- Adding an `ENCRYPTION_KEY` env or crypto module — explicitly deferred.

## Git workflow

- Branch: `advisor/005-bank-token-claim-drift` off fresh `main`
- Conventional commit, e.g. `docs(db): correct bank-connection token at-rest claims; pin never-written invariant`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Correct the schema comments

In `lib/db/schema.ts`, rewrite the two claims to the truth. Target shape:

- Table doc: "…Holds the PSD2 consent (which expires — SCA re-consent ~every 90 days). The
  consent/session handle (`providerConnectionId`) is stored plaintext — it is unusable
  without the app's Enable Banking RSA key + application id. Aggregator bearer tokens are
  never persisted (see the repo layer: no write path exposes `accessToken`/`refreshToken`)."
- Column comment: "Reserved: aggregator access/refresh tokens. Never written today — the
  repo layer exposes no write path. If persisting them ever becomes necessary, add
  app-layer encryption first (do not write raw bearer tokens)."

**Verify**: `grep -n "encrypted at rest" lib/db/schema.ts` → no matches.

### Step 2: Correct the repo comment

In `lib/db/household-repo.ts`, replace the "#113 encrypted write path" sentence with the
truth: tokens are intentionally not settable here *and no other write path exists* — any
future persistence must add encryption first. Keep the `Omit` exactly as it is.

**Verify**: `grep -n "ciphertext\|encrypted write path" lib/db/household-repo.ts` → no matches.

### Step 3: Pin the invariant with tests

In `lib/db/schema.bank-connections.test.ts`:

1. **Type-level** (caught by `pnpm typecheck`, which runs on test files): assert the repo's
   write surface rejects tokens —

   ```ts
   // @ts-expect-error accessToken must not be settable via the household repo
   repo.bankConnections.create({ provider: "enable_banking", providerConnectionId: "x", accessToken: "t", ... })
   ```

   (Adapt the argument shape to compile except for the token field; do the same for
   `update` with `refreshToken`. Wrap in a never-executed function if needed so no DB call
   fires — the assertion is the compile error.)
2. **Runtime**: after creating a connection through the repo (pglite pattern already in
   this file), select the row and assert `accessToken === null && refreshToken === null`.

**Verify**: `pnpm typecheck` → exit 0 (proves the `@ts-expect-error` lines are actually
erroring); `pnpm test:run lib/db/schema.bank-connections` → all pass.

## Test plan

Covered in Step 3; pattern: the existing pglite tests in
`lib/db/schema.bank-connections.test.ts`.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test:run` exits 0, incl. the new invariant tests
- [ ] `pnpm lint` exits 0
- [ ] `grep -rn "encrypted at rest\|encrypted write path" lib/` → no matches
- [ ] `git diff` on `schema.ts`/`household-repo.ts` shows comment-only changes (no code)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- An encryption module DOES exist somewhere unexpected (re-grep first:
  `grep -rn "createCipheriv\|subtle.encrypt" lib app scripts`) — then the drift runs the
  other way and the comments may be right.
- You find a write path that sets `accessToken`/`refreshToken` (the `@ts-expect-error`
  fails to error, or the runtime test finds non-null) — that is a live raw-bearer-token
  persistence, a real finding; report immediately.
- Issue #113 (referenced in the stale comment) turns out to describe intended future work
  that contradicts this plan's direction — check `gh issue view 113` if `gh` is available;
  if it prescribes encryption-before-storage as *pending* work, say so in your report so
  the maintainer can choose between documenting vs. implementing.

## Maintenance notes

- Deferred decision, recorded here: implement app-layer encryption (envelope encryption,
  key via env/KMS) **before** any change that persists aggregator bearer tokens. The new
  column comment carries this instruction forward.
- Reviewer: confirm zero behavioral diff (comments + tests only).
- If Enable Banking's model changes such that the session id alone becomes a bearer
  credential (no RSA signing required), the plaintext `providerConnectionId` posture must
  be revisited — that assumption is load-bearing for "plaintext is acceptable".
