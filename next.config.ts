import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Pin the workspace root: this lives in a git worktree nested under the parent
  // repo, which has its own pnpm-workspace.yaml, so Next would otherwise infer the
  // ancestor as root. __dirname is always this project dir (correct post-merge too).
  turbopack: {
    root: __dirname,
  },
}

export default nextConfig
