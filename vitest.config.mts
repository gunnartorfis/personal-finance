import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    exclude: [
      "**/node_modules/**",
      "**/legacy/**",
      "**/dist/**",
      "**/.next/**",
      // Agent worktrees checked out under .claude/ are separate copies of the repo — running their
      // test files from here double-runs everything against the wrong module graph.
      "**/.claude/**",
    ],
  },
})
