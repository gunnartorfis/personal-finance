import createNextIntlPlugin from "next-intl/plugin"
import type { NextConfig } from "next"

const withNextIntl = createNextIntlPlugin()

const nextConfig: NextConfig = {
  // Pin the workspace root: this lives in a git worktree nested under the parent
  // repo, which has its own pnpm-workspace.yaml, so Next would otherwise infer the
  // ancestor as root. __dirname is always this project dir (correct post-merge too).
  turbopack: {
    root: __dirname,
  },
  // The account/security views moved under the Settings hub; keep old bookmarks and any
  // externally-linked account URLs working instead of 404ing.
  async redirects() {
    return [
      { source: "/account/settings", destination: "/settings/account", permanent: true },
      { source: "/account/security", destination: "/settings/security", permanent: true },
      { source: "/account", destination: "/settings/account", permanent: true },
    ]
  },
  // Security response headers (plan 003) — applied to every path. Kept here (not vercel.json) so they
  // exist in local dev and tests too. CSP ships as Report-Only: an enforced policy would break the
  // Adyen/Straumur payment Drop-in and Next's inline runtime; Report-Only makes violations visible
  // without breakage, to be tightened and flipped to enforcing after production burn-in.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // 30 days. Deliberately NOT includeSubDomains/preload and not a 2-year max-age: HSTS is
          // one-way for its window and this project has no visibility into other apex subdomains.
          // Raise the max-age (and consider includeSubDomains) in a later PR after burn-in.
          { key: "Strict-Transport-Security", value: "max-age=2592000" },
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              // 'unsafe-inline'/'unsafe-eval' are deliberate for the Report-Only baseline (Next inline
              // runtime + Adyen Drop-in); tighten with real report data before enforcing.
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
}

/**
 * The pre-plugin config, exported for tests (the `withNextIntl` default export is what Next loads).
 * Assert header/redirect behaviour against this so tests don't depend on the plugin wrapper's shape.
 */
export const baseConfig = nextConfig

export default withNextIntl(nextConfig)
