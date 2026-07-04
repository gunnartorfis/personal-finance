# Plan 003: Ship security response headers (HSTS, nosniff, frame-ancestors, Referrer-Policy, report-only CSP)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a1ed56c..HEAD -- next.config.ts vercel.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — an enforced CSP could break the Adyen/Straumur payment Drop-in and Next.js
  inline scripts; this plan therefore ships CSP as **Report-Only** and enforces only the
  safe headers. HSTS is effectively irreversible for the max-age window — see Step 2.
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `a1ed56c`, 2026-07-04

## Why this matters

This is an authenticated multi-tenant finance app (bank statements, billing) and it
currently ships **zero** security response headers: `next.config.ts` configures only
`turbopack` and `redirects()`, `vercel.json` has no `headers` block, and there is no
`headers()` anywhere. That means no HSTS (TLS-downgrade exposure), no clickjacking
protection on billing/settings pages, no `X-Content-Type-Options: nosniff` (including on
the GDPR export download at `app/api/export/route.ts`, which serves the household's entire
financial dataset as an attachment), and no CSP containment if an XSS ever lands. The
XSS audit came back clean today (React text nodes everywhere, one dev-config-only
`dangerouslySetInnerHTML` in `components/ui/chart.tsx`), so CSP is blast-radius insurance,
not a hole-plug — which is why Report-Only first is the right call.

## Current state

- `next.config.ts` (entire relevant content today):

  ```ts
  const nextConfig: NextConfig = {
    turbopack: { root: __dirname },
    async redirects() {
      return [
        { source: "/account/settings", destination: "/settings/account", permanent: true },
        // … two more /account redirects
      ]
    },
  }
  export default withNextIntl(nextConfig)
  ```

  No `headers()`. `vercel.json` holds only `git.deploymentEnabled` and two `crons` entries.

- Payment UI: `@adyen/adyen-web` v6 Drop-in is used for checkout (Straumur is an Adyen
  reseller). Adyen's web Drop-in loads assets/frames from Adyen-operated origins — this is
  exactly what an enforced CSP would break, hence Report-Only.

- `app/api/export/route.ts:57-64` sets `content-type: application/json`,
  `content-disposition: attachment; …`, `cache-control: no-store` — no `nosniff`. A global
  header via `headers()` covers this route too (Next `headers()` applies to all paths
  matched by `source`).

- Deployment: Vercel, production domain served over HTTPS only (Vercel default).

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Install   | `pnpm install`   | exit 0              |
| Typecheck | `pnpm typecheck` | exit 0, no errors   |
| Tests     | `pnpm test:run next.config` | all pass  |
| Full tests| `pnpm test:run`  | all pass            |
| Lint      | `pnpm lint`      | exit 0              |
| Manual    | `pnpm dev` + `curl -sI http://localhost:3000/ \| grep -i x-content` | header present |

## Scope

**In scope** (the only files you should modify):
- `next.config.ts`
- `next.config.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):
- `vercel.json` — keep headers in `next.config.ts` so they exist in local dev and tests too.
- `proxy.ts` (middleware) — plan 004 owns it; don't add headers there.
- `app/api/export/route.ts` — the global header covers it; no per-route duplication.
- Any attempt to inline nonces / per-request CSP — that requires middleware and is
  explicitly deferred.

## Git workflow

- Branch: `advisor/003-security-response-headers` off fresh `main`
- Conventional commit, e.g. `feat(security): add security response headers + report-only CSP`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `headers()` to `next.config.ts`

Add to the existing `nextConfig` object (keep `redirects()` as is):

```ts
async headers() {
  return [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        {
          key: "Content-Security-Policy-Report-Only",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.adyen.com",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https://*.adyen.com",
            "connect-src 'self' https://*.adyen.com https://*.straumur.is",
            "frame-src https://*.adyen.com",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join("; "),
        },
      ],
    },
  ]
},
```

Notes for the executor:
- `'unsafe-inline'`/`'unsafe-eval'` in script-src are deliberate for the Report-Only
  baseline (Next.js inline runtime + Adyen); tightening comes later with real report data.
- Before finalizing the Adyen/Straumur origins, grep the repo for the actual hosts:
  `grep -rn "https://" lib/payments/ components/ app/(app)/settings --include='*.ts*' | grep -iv test`
  and include every payment-related origin you find (checkout session URLs, Drop-in asset
  hosts). If a host is configured via env (e.g. a Straumur API base), include its
  documented production origin from the env var's doc comment rather than a guess.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: HSTS — add with a modest max-age

Add to the same headers array:

```ts
{ key: "Strict-Transport-Security", value: "max-age=2592000" }, // 30 days; raise after burn-in
```

Deliberately NOT `includeSubDomains; preload` and not a 2-year max-age yet: HSTS is
one-way for its window, and this repo's advisor has no visibility into other subdomains on
the production apex. Leave a comment saying exactly that so a later PR can raise it.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Test the header set

Create `next.config.test.ts` at the repo root (Vitest picks up root-level `*.test.ts` —
`proxy.test.ts` already lives there; follow its import style):

- Import the default export of `next.config.ts`, call `await config.headers()`, and assert:
  the single rule matches `/(.*)`; `X-Content-Type-Options` is `nosniff`; HSTS present;
  `X-Frame-Options` is `DENY`; the CSP header key is exactly
  `Content-Security-Policy-Report-Only` (a typo here silently enforces or silently
  disables — this test is the guard); CSP value contains `frame-ancestors 'none'`.
- Note: the config is wrapped by `withNextIntl(...)` — if the wrapper obscures `headers`,
  import and test the inner object by exporting it named (`export const baseConfig = …`)
  and asserting on that instead. Keep the default export unchanged.

**Verify**: `pnpm test:run next.config` → all new assertions pass.

### Step 4: Manual smoke check

Run `pnpm dev`, then:
`curl -sI http://localhost:3000/ | grep -iE "x-content-type|strict-transport|frame|referrer|security-policy"`
→ all five headers present on the response. Also confirm the checkout page still renders
(`/settings` → billing) if a dev Straumur config is available; if not available, note that
in your report — do not block on it.

## Test plan

Covered in Step 3 (`next.config.test.ts`, modeled on root-level `proxy.test.ts`).

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test:run` exits 0 incl. `next.config.test.ts`
- [ ] `pnpm lint` exits 0
- [ ] `curl -sI` against dev shows the headers (Step 4)
- [ ] CSP is Report-Only (grep confirms no bare `Content-Security-Policy` key)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `next.config.ts` no longer matches the excerpt (drift).
- `withNextIntl` or Next 16 rejects the `headers()` shape (check
  `node_modules/next/dist/docs/` per AGENTS.md before assuming the API — Next 16 may
  differ from training data).
- You cannot determine the real Adyen/Straumur origins from the repo — report the grep
  results instead of shipping guessed origins.
- Anything requires an enforced (non-Report-Only) CSP to pass — enforcement is explicitly
  a later, human-approved step.

## Maintenance notes

- Follow-up (deferred): after production burn-in, review CSP violation reports (add a
  `report-to`/collection endpoint or use Vercel logs), tighten `script-src`, then flip to
  enforcing `Content-Security-Policy`; raise HSTS max-age and consider `includeSubDomains`.
- If a new third-party embed lands (analytics, fonts, another PSP), its origins must be
  added to the CSP value — the Report-Only header makes misses visible, not broken.
- Reviewer: `X-Frame-Options: DENY` + `frame-ancestors 'none'` — confirm nothing legit
  embeds the app in an iframe (the Adyen 3DS flow redirects top-level; it does not iframe
  *our* app, so DENY is safe).
