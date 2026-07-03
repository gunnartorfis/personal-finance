import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import i18next from "eslint-plugin-i18next"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // i18n enforcement (ADR-0013): no hard-coded user-facing copy in the rendered app. Flags literal
  // JSX text — every visible string must come from the message catalogs via next-intl. Scoped to
  // app/** + components/** (lib, API routes, tests, scripts, drizzle, and the ui/ primitives are
  // exempt). `jsx-text-only` checks only JSX text nodes, so t()/t.rich() calls, {expressions},
  // numbers and attributes don't trip it. `<Kbd>` holds keyboard-key glyphs (not copy); brand name
  // and bare punctuation are allowlisted. Genuinely-literal data (illustrative sample figures) uses
  // a scoped eslint-disable with a reason.
  {
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    ignores: ["**/*.test.tsx", "components/ui/**"],
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-text-only",
          "jsx-components": { exclude: ["Kbd"] },
          // Skip the brand wordmark and any text node that is *entirely* punctuation / symbols /
          // emoji (e.g. "%", "·", "—", "🎉" sitting beside a {value}) — those aren't translatable
          // copy. Patterns are fully anchored (^…$): the plugin wraps each as `(^|\.)<pattern>$`,
          // so without a leading ^ the "dot-ahead" branch would let any text whose tail after a "."
          // is non-letters (e.g. "Sale ends 12.31") slip through the guardrail.
          words: { exclude: ["^Finance$", "^[^A-Za-zÀ-ÿ]+$"] },
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Frozen Vite tool + not-yet-wired shared core (excluded from tsconfig too).
    "legacy/**",
    "shared/**",
    // Stale legacy build output and local tool state — never source.
    "dist/**",
    ".claude/**",
  ]),
])

export default eslintConfig
