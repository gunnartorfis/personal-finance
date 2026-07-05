/**
 * Spending categories in display order. `swatch` is the Tailwind class for the HTML legend dots;
 * `color` is the raw (theme-aware) fill fed to Recharts — both drawn from the same source so the
 * chart marks and their legend never drift. The three real expense types get distinct hues; the
 * unbucketed (`""` → "Other") and not-yet-classified totals share a neutral so the eye reads them as
 * "no category". `slug` is the CSS-/dataKey-safe id used for Recharts stacks and `--color-*` vars.
 */
export const CATEGORIES = [
  {
    key: "Fixed",
    slug: "fixed",
    label: "Fixed",
    swatch: "bg-emerald-500",
    color: {
      light: "var(--color-emerald-500)",
      dark: "var(--color-emerald-500)",
    },
  },
  {
    key: "Necessary",
    slug: "necessary",
    label: "Necessary",
    swatch: "bg-amber-500",
    color: { light: "var(--color-amber-500)", dark: "var(--color-amber-500)" },
  },
  {
    key: "Nice to have",
    slug: "nice-to-have",
    label: "Nice to have",
    swatch: "bg-rose-500",
    color: { light: "var(--color-rose-500)", dark: "var(--color-rose-500)" },
  },
  {
    key: "Other",
    slug: "other",
    label: "Other",
    swatch: "bg-zinc-400 dark:bg-zinc-500",
    color: { light: "var(--color-zinc-400)", dark: "var(--color-zinc-500)" },
  },
  {
    key: "Unclassified",
    slug: "unclassified",
    label: "Unclassified",
    swatch: "bg-zinc-300 dark:bg-zinc-700",
    color: { light: "var(--color-zinc-300)", dark: "var(--color-zinc-700)" },
  },
] as const
