# Plan 004: Add in-app CSRF defense-in-depth (Sec-Fetch-Site check on mutating API requests)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a1ed56c..HEAD -- proxy.ts proxy.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW — the check only rejects requests that carry a browser-set
  `Sec-Fetch-Site` header proving cross-site provenance; server-to-server callers
  (webhooks, crons) don't send the header and are unaffected.
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `a1ed56c`, 2026-07-04

## Why this matters

Every cookie-authenticated, state-changing API route (delete household, cancel billing,
leave household, override/exclude transactions, replace budgets/savings config, uploads —
~20 routes) relies on a single CSRF defense: the belief that the Neon Auth session cookie
is `SameSite=Strict`. That belief exists only as an inline comment in
`app/api/open-banking/callback/route.ts:44-47`; no code in this repo sets, asserts, or
tests the cookie attribute (it's a third-party library default), and no route does an
origin check of its own. If a Neon Auth upgrade ever changes that default to `Lax` (the
web platform default) or `None`, the entire mutation surface silently becomes
CSRF-exposed at once — `SameSite=Lax` still sends cookies on top-level cross-site POST
form navigations, and `app/api/uploads/route.ts` accepts `multipart/form-data`, a
form-submittable content type. This plan adds one browser-enforced, library-independent
layer: reject mutating `/api` requests whose `Sec-Fetch-Site` header proves a cross-site
initiator. Browsers have sent this header since ~2020 and it cannot be forged or stripped
by web content.

## Current state

- `proxy.ts` (repo root) — the Next 16 middleware entry (named `proxy.ts` in Next 16). Today:

  ```ts
  const authMiddleware = auth.middleware({ loginUrl: "/auth/sign-in" });

  export default function middleware(request: NextRequest) {
    // Don't intercept Server Action POSTs (they carry a Next-Action header).
    if (request.headers.has("Next-Action")) {
      return;
    }
    return authMiddleware(request);
  }

  export const config = {
    matcher: [
      "/accounts/:path*",
      "/dashboard/:path*",
      // … settings, savings, transactions, upload — pages only, NO /api entries
    ],
  };
  ```

  API routes are deliberately absent from the matcher (they self-guard for *auth* via
  `requireHousehold()`); this plan adds them for the *CSRF* check only — auth behavior on
  APIs must not change.

- `proxy.test.ts` (repo root) — existing test; mocks `@/lib/auth/server` so importing
  `proxy.ts` doesn't pull the real Neon Auth module:

  ```ts
  vi.mock("@/lib/auth/server", () => ({
    auth: { middleware: () => () => undefined },
  }))
  ```

  Follow this pattern; it asserts on `config.matcher` contents. Extend it.

- Routes that legitimately receive non-browser POSTs: `app/api/webhooks/straumur`
  (Straumur's servers; HMAC is its trust boundary) and the cron GETs
  (`/api/billing/renew`, `/api/open-banking/sync` — GET, so untouched by a
  mutating-method check; the sync POST variant is browser-initiated same-origin).
  `app/api/auth/[...path]` is Neon Auth's own handler managing its own flows.

## Commands you will need

| Purpose   | Command                    | Expected on success |
|-----------|----------------------------|---------------------|
| Install   | `pnpm install`             | exit 0              |
| Typecheck | `pnpm typecheck`           | exit 0, no errors   |
| Tests     | `pnpm test:run proxy`      | all pass            |
| Full tests| `pnpm test:run`            | all pass            |
| Lint      | `pnpm lint`                | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `proxy.ts`
- `proxy.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- `lib/household/current.ts` (`requireHousehold`) — it has no `Request` in scope; the
  middleware is the right layer.
- Any individual `app/api/**/route.ts` — no per-route CSRF code.
- Neon Auth configuration (`lib/auth/*`) — asserting/forcing the cookie attribute is a
  separate concern; this plan is the in-repo layer that works regardless.
- Security headers — plan 003 owns `next.config.ts`.

## Git workflow

- Branch: `advisor/004-csrf-defense-in-depth` off fresh `main`
- Conventional commit, e.g. `feat(security): reject cross-site mutating API requests in middleware`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the cross-site check to `proxy.ts`

Shape (adapt naming/comments to the file's existing voice — it explains *why* heavily):

```ts
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// Non-browser callers (Straumur webhook; Neon Auth's own handler manages its own flows).
const CSRF_EXEMPT = [/^\/api\/webhooks\//, /^\/api\/auth\//];

function isCrossSite(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  // Absent = non-browser client (webhooks, curl, tests) or a very old browser — the
  // SameSite cookie remains the defense there. "none" = user-initiated (address bar).
  return site !== null && site !== "same-origin" && site !== "none";
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    if (
      MUTATING.has(request.method) &&
      !CSRF_EXEMPT.some((re) => re.test(pathname)) &&
      isCrossSite(request)
    ) {
      return new Response("Cross-site request rejected", { status: 403 });
    }
    return; // API auth stays in the routes (requireHousehold) — never run authMiddleware here.
  }
  if (request.headers.has("Next-Action")) {
    return;
  }
  return authMiddleware(request);
}
```

Add `"/api/:path*"` to `config.matcher`. Note `"same-site"` (e.g. a sibling subdomain) is
deliberately rejected — nothing legit calls the API from another subdomain.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Extend `proxy.test.ts`

Keep the existing tests untouched (they must still pass — especially "matcher does not
contain a catch-all"; adding `"/api/:path*"` does not violate those assertions, but rerun
to confirm). Add cases that call the default-exported `middleware` with constructed
`NextRequest` objects (`new NextRequest("http://localhost/api/accounts", { method: "POST", headers: … })`):

1. POST `/api/accounts` with `sec-fetch-site: cross-site` → `Response` with status 403.
2. POST `/api/accounts` with `sec-fetch-site: same-site` → 403 (subdomains rejected).
3. POST `/api/accounts` with `sec-fetch-site: same-origin` → `undefined` (falls through).
4. POST `/api/accounts` with NO `sec-fetch-site` header → `undefined` (non-browser).
5. GET `/api/billing/status` with `sec-fetch-site: cross-site` → `undefined` (GET untouched).
6. POST `/api/webhooks/straumur` with `sec-fetch-site: cross-site` → `undefined` (exempt).
7. POST `/api/auth/anything` → `undefined` (exempt).
8. A page path (e.g. `/dashboard`) still reaches the (mocked) auth middleware — assert the
   mock is invoked for it and NOT for `/api/*` paths.
9. `config.matcher` contains `"/api/:path*"`.

**Verify**: `pnpm test:run proxy` → all pass (existing + ~9 new).

## Test plan

Covered in Step 2; pattern: the existing `proxy.test.ts` (same mock, same file).

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test:run` exits 0, incl. the new middleware cases
- [ ] `pnpm lint` exits 0
- [ ] `/api/*` requests never reach `authMiddleware` (test 8 proves it)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `proxy.ts`/`proxy.test.ts` no longer match the excerpts (drift — this repo has many
  parallel work streams).
- Next 16's middleware API differs from the shape above (per AGENTS.md, check
  `node_modules/next/dist/docs/` first) and the adaptation isn't mechanical.
- Constructing `NextRequest` in Vitest fails on the runtime environment — report rather
  than switching the whole test file to a different harness.
- You find an existing legitimate cross-site browser POST to `/api/*` (e.g. a bank or PSP
  posting a browser form back to us) other than the exempted paths — that flow would break;
  report it.

## Maintenance notes

- The open-banking bank redirect returns via GET to `/api/open-banking/callback` — GETs are
  untouched, so it keeps working; if that callback ever becomes a POST, add it to
  `CSRF_EXEMPT` (its `state` cookie+intent check is its own CSRF defense).
- If Neon Auth's cookie ever changes SameSite behavior, this middleware is the remaining
  guard — do not remove it during auth-library upgrades.
- Reviewer: confirm the matcher addition doesn't route `/api` through the auth redirect
  (the early `return` inside the `/api` branch is load-bearing).
- Deferred (why): asserting the Set-Cookie `SameSite=Strict` attribute in an integration
  test requires booting the real Neon Auth handler; revisit if/when an E2E harness exists.
