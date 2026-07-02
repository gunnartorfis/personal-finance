import type { NextConfig } from "next"

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
}

export default nextConfig
