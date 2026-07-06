import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  Download,
  Landmark,
  LineChart,
  PiggyBank,
  Repeat,
  ScanLine,
  Sparkles,
  Tags,
  Target,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import type { ComponentType, ReactNode, SVGProps } from "react"

import { cn } from "@/lib/utils"

/**
 * Public marketing page for signed-out visitors (the logged-in root redirects to the dashboard).
 * A server component — pure markup and links, no client state — so it renders statically and the
 * auth-gated root page (`app/page.tsx`) can decide which to show. Copy and layout follow the
 * product's own language (Household, Statement cycle, Expense type) and reuse the app's design
 * tokens so the marketing surface reads as the same product as the dashboard behind it. Copy comes
 * from the `landing` catalog; the illustrative figures in the hero preview stay literal (sample
 * data, not chrome).
 */

const SIGN_UP_HREF = "/auth/sign-up"
const SIGN_IN_HREF = "/auth/sign-in"

/** Solid brand CTA — the single repeated conversion action across the page. */
function PrimaryCta({
  href,
  children,
  className,
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className
      )}
    >
      {children}
    </Link>
  )
}

/** Muted, lower-contrast counterpart to {@link PrimaryCta}; reused for every secondary action. */
function SecondaryCta({
  href,
  children,
  className,
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className
      )}
    >
      {children}
    </Link>
  )
}

/** The app's wordmark — the same piggy-bank + "Finance" lockup used in the signed-in sidebar. */
function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold", className)}>
      <PiggyBank className="size-6 shrink-0 text-primary" aria-hidden="true" />
      Finance
    </span>
  )
}

/** Sticky top navigation with the wordmark and the sign-in / get-started actions. */
function LandingHeader() {
  const t = useTranslations("landing")
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          aria-label={t("nav.homeAria")}
          className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Wordmark className="text-base" />
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            href={SIGN_IN_HREF}
            className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("nav.signIn")}
          </Link>
          <PrimaryCta href={SIGN_UP_HREF} className="h-9 px-4">
            {t("nav.getStarted")}
          </PrimaryCta>
        </nav>
      </div>
    </header>
  )
}

/** Hero — left-aligned split: pitch on the left, a live-looking dashboard card on the right. */
function Hero() {
  const t = useTranslations("landing")
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-0 -z-10 size-[36rem] rounded-full bg-primary/10 blur-3xl dark:bg-primary/5"
      />
      <div className="mx-auto grid max-w-6xl gap-12 px-6 pt-16 pb-20 lg:grid-cols-2 lg:items-center lg:gap-8 lg:pt-24 lg:pb-28">
        <div className="flex flex-col items-start gap-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm font-medium text-muted-foreground">
            <span
              className="size-1.5 rounded-full bg-primary"
              aria-hidden="true"
            />
            {t("hero.badge")}
          </p>
          <h1 className="max-w-[20ch] text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            {t("hero.title")}
          </h1>
          <p className="max-w-[48ch] text-lg text-pretty text-muted-foreground">
            {t("hero.body")}
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <PrimaryCta href={SIGN_UP_HREF} className="w-full sm:w-auto">
              {t("hero.startFree")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </PrimaryCta>
            <SecondaryCta href={SIGN_IN_HREF} className="w-full sm:w-auto">
              {t("hero.signIn")}
            </SecondaryCta>
          </div>
          <p className="text-sm text-muted-foreground">{t("hero.noCard")}</p>
        </div>

        <ProductPreview />
      </div>
    </section>
  )
}

/** How it works — left-aligned three-step walkthrough. */
function HowItWorks() {
  const t = useTranslations("landing")

  // Copy resolved with literal keys, then paired with its icon; keeps the render map declarative
  // while satisfying next-intl's static key checking (no interpolated keys). Each row carries a
  // stable `id` so list `key`s don't depend on the (locale-varying) translated text.
  const steps: {
    id: string
    icon: ComponentType<SVGProps<SVGSVGElement>>
    title: string
    body: string
  }[] = [
    {
      id: "upload",
      icon: Upload,
      title: t("steps.upload.title"),
      body: t("steps.upload.body"),
    },
    {
      id: "sort",
      icon: Sparkles,
      title: t("steps.sort.title"),
      body: t("steps.sort.body"),
    },
    {
      id: "track",
      icon: TrendingUp,
      title: t("steps.track.title"),
      body: t("steps.track.body"),
    },
  ]

  return (
    <section className="border-t border-border py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-primary">
            {t("steps.eyebrow")}
          </p>
          <h2 className="max-w-[24ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {t("steps.title")}
          </h2>
        </div>
        <ol className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.id} className="flex flex-col items-start gap-3">
              <span className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-full border border-border text-sm font-semibold text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <step.icon
                  className="size-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
              </span>
              <h3 className="text-lg font-medium">{step.title}</h3>
              <p className="text-base text-pretty text-muted-foreground">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/** Features — left-aligned description list of what the product does. */
function Features() {
  const t = useTranslations("landing")

  // Features are grouped into three themes so the full product surface reads as a story rather than a
  // flat wall of items. Each item carries a stable `id` (list keys don't depend on translated text)
  // and its icon; copy is resolved with literal keys for next-intl's static checking.
  const featureGroups: {
    id: string
    title: string
    items: {
      id: string
      icon: ComponentType<SVGProps<SVGSVGElement>>
      title: string
      body: string
    }[]
  }[] = [
    {
      id: "understand",
      title: t("features.groups.understand"),
      items: [
        {
          id: "ai",
          icon: Sparkles,
          title: t("features.ai.title"),
          body: t("features.ai.body"),
        },
        {
          id: "categories",
          icon: Tags,
          title: t("features.categories.title"),
          body: t("features.categories.body"),
        },
        {
          id: "insights",
          icon: LineChart,
          title: t("features.insights.title"),
          body: t("features.insights.body"),
        },
        {
          id: "recurring",
          icon: Repeat,
          title: t("features.recurring.title"),
          body: t("features.recurring.body"),
        },
        {
          id: "transfers",
          icon: ArrowLeftRight,
          title: t("features.transfers.title"),
          body: t("features.transfers.body"),
        },
      ],
    },
    {
      id: "control",
      title: t("features.groups.control"),
      items: [
        {
          id: "budgets",
          icon: Target,
          title: t("features.budgets.title"),
          body: t("features.budgets.body"),
        },
        {
          id: "forecast",
          icon: TrendingUp,
          title: t("features.forecast.title"),
          body: t("features.forecast.body"),
        },
        {
          id: "savings",
          icon: PiggyBank,
          title: t("features.savings.title"),
          body: t("features.savings.body"),
        },
        {
          id: "balance",
          icon: ScanLine,
          title: t("features.balance.title"),
          body: t("features.balance.body"),
        },
      ],
    },
    {
      id: "household",
      title: t("features.groups.household"),
      items: [
        {
          id: "import",
          icon: Upload,
          title: t("features.import.title"),
          body: t("features.import.body"),
        },
        {
          id: "banksync",
          icon: Landmark,
          title: t("features.banksync.title"),
          body: t("features.banksync.body"),
        },
        {
          id: "shared",
          icon: Users,
          title: t("features.household.title"),
          body: t("features.household.body"),
        },
        {
          id: "export",
          icon: Download,
          title: t("features.export.title"),
          body: t("features.export.body"),
        },
      ],
    },
  ]

  return (
    <section className="border-t border-border py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-primary">
            {t("features.eyebrow")}
          </p>
          <h2 className="max-w-[26ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {t("features.title")}
          </h2>
        </div>
        <div className="mt-12 flex flex-col gap-14">
          {featureGroups.map((group) => (
            <div key={group.id} className="flex flex-col gap-6">
              <h3 className="text-xl font-medium">{group.title}</h3>
              <dl className="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
                {group.items.map((feature) => (
                  <div key={feature.id} className="flex flex-col gap-2">
                    <dt className="flex items-center gap-2 text-lg font-medium">
                      <feature.icon
                        className="size-5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      {feature.title}
                    </dt>
                    <dd className="text-base text-pretty text-muted-foreground">
                      {feature.body}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Pricing — centered on a recessed background to separate it from the left-aligned sections. */
function Pricing() {
  const t = useTranslations("landing")

  const freeFeatures = [
    { id: "f1", label: t("pricing.free.f1") },
    { id: "f2", label: t("pricing.free.f2") },
    { id: "f3", label: t("pricing.free.f3") },
    { id: "f4", label: t("pricing.free.f4") },
  ]
  const premiumFeatures = [
    { id: "f1", label: t("pricing.premium.f1") },
    { id: "f2", label: t("pricing.premium.f2") },
    { id: "f3", label: t("pricing.premium.f3") },
    { id: "f4", label: t("pricing.premium.f4") },
  ]

  return (
    <section className="border-t border-border bg-muted/40 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-medium text-primary">
            {t("pricing.eyebrow")}
          </p>
          <h2 className="mx-auto max-w-[22ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {t("pricing.title")}
          </h2>
          <p className="mx-auto max-w-[46ch] text-lg text-pretty text-muted-foreground">
            {t("pricing.subtitle")}
          </p>
        </div>
        <div className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-8 sm:grid-cols-2">
          {/* Free plan */}
          <div className="flex flex-col justify-between gap-8 rounded-2xl border border-border bg-card p-6">
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-medium">
                  {t("pricing.free.name")}
                </h3>
              </div>
              <div className="flex items-baseline gap-1">
                <div className="text-4xl font-semibold tracking-tight tabular-nums">
                  {t("pricing.free.price")}
                </div>
              </div>
              <p className="text-base text-pretty text-muted-foreground">
                {t("pricing.free.description")}
              </p>
              <ul className="flex flex-col gap-3">
                {freeFeatures.map((feature) => (
                  <li
                    key={feature.id}
                    className="flex items-start gap-2 text-base text-muted-foreground"
                  >
                    <Check
                      className="size-4 h-lh shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    {feature.label}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              <SecondaryCta href={SIGN_UP_HREF} className="w-full">
                {t("pricing.free.cta")}
              </SecondaryCta>
            </div>
          </div>

          {/* Premium plan */}
          <div className="flex flex-col justify-between gap-8 rounded-2xl border border-border bg-card p-6">
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-medium">
                  {t("pricing.premium.name")}
                </h3>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  {t("pricing.recommended")}
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <div className="text-4xl font-semibold tracking-tight tabular-nums">
                  {t("pricing.premium.price")}
                </div>
                <div className="text-base font-normal text-muted-foreground">
                  {t("pricing.premium.cadence")}
                </div>
              </div>
              <p className="text-base text-pretty text-muted-foreground">
                {t("pricing.premium.description")}
              </p>
              <ul className="flex flex-col gap-3">
                {premiumFeatures.map((feature) => (
                  <li
                    key={feature.id}
                    className="flex items-start gap-2 text-base text-muted-foreground"
                  >
                    <Check
                      className="size-4 h-lh shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    {feature.label}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              <PrimaryCta href={SIGN_UP_HREF} className="w-full">
                {t("pricing.premium.cta")}
              </PrimaryCta>
              <p className="text-center text-sm text-muted-foreground">
                {t("pricing.premium.note")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/** Final CTA — centered, echoing the hero's single conversion action. */
function FinalCta() {
  const t = useTranslations("landing")
  return (
    <section className="border-t border-border py-20 sm:py-28">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 text-center">
        <h2 className="mx-auto max-w-[22ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t("finalCta.title")}
        </h2>
        <p className="mx-auto max-w-[42ch] text-lg text-pretty text-muted-foreground">
          {t("finalCta.body")}
        </p>
        <PrimaryCta href={SIGN_UP_HREF}>
          {t("finalCta.cta")}
          <ArrowRight className="size-4" aria-hidden="true" />
        </PrimaryCta>
      </div>
    </section>
  )
}

/** Site footer — wordmark, tagline, and the same sign-in / get-started / source links. */
function LandingFooter() {
  const t = useTranslations("landing")
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <Wordmark className="text-base" />
          <p className="text-sm text-muted-foreground">{t("footer.tagline")}</p>
        </div>
        <nav className="flex items-center gap-5">
          <Link
            href={SIGN_IN_HREF}
            className="text-sm font-normal text-muted-foreground hover:text-foreground"
          >
            {t("footer.signIn")}
          </Link>
          <Link
            href={SIGN_UP_HREF}
            className="text-sm font-normal text-muted-foreground hover:text-foreground"
          >
            {t("footer.getStarted")}
          </Link>
          <a
            href="https://github.com/gunnartorfis/personal-finance"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-normal text-muted-foreground hover:text-foreground"
          >
            {t("footer.github")}
          </a>
        </nav>
      </div>
    </footer>
  )
}

export function LandingPage() {
  return (
    <div className="isolate flex min-h-dvh flex-col bg-background text-foreground">
      <LandingHeader />

      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Features />
        <Pricing />
        <FinalCta />
      </main>

      <LandingFooter />
    </div>
  )
}

// Illustrative sample figures for {@link ProductPreview} — not real data, so they stay literal and
// are only paired with localized labels. Hoisted to module scope (they use no props/state) so they
// read as sample data, not copy, and aren't rebuilt on every render.
const PREVIEW_SAMPLE = {
  net: "+284.500 kr",
  income: "920.000 kr",
  expenses: "635.500 kr",
}

/**
 * A static, illustrative dashboard card for the hero — mirrors the real {@link NetSummaryCard}
 * (net profit + income/expenses split + spending-by-type bar) with representative figures so the
 * hero shows the actual product surface rather than a stock screenshot. Decorative only: the
 * figures are sample data and stay literal; only the surrounding labels are localized.
 */
function ProductPreview() {
  const t = useTranslations("landing.preview")

  const legend = [
    {
      id: "fixed",
      label: t("legend.fixed"),
      amount: "305.000 kr",
      swatch: "bg-emerald-500",
    },
    {
      id: "necessary",
      label: t("legend.necessary"),
      amount: "216.500 kr",
      swatch: "bg-amber-500",
    },
    {
      id: "niceToHave",
      label: t("legend.niceToHave"),
      amount: "114.000 kr",
      swatch: "bg-rose-500",
    },
  ]

  // The orthogonal Category axis (ADR-0020) shown beside the by-type split — same total, different
  // lens (what was bought, not how essential). Illustrative sample figures, like the type legend.
  const categoryLegend = [
    { id: "groceries", label: t("categoryLegend.groceries"), amount: "210.000 kr", swatch: "bg-sky-500" },
    { id: "transport", label: t("categoryLegend.transport"), amount: "150.000 kr", swatch: "bg-violet-500" },
    { id: "eatingOut", label: t("categoryLegend.eatingOut"), amount: "120.000 kr", swatch: "bg-teal-500" },
    { id: "subscriptions", label: t("categoryLegend.subscriptions"), amount: "90.000 kr", swatch: "bg-fuchsia-500" },
    { id: "other", label: t("categoryLegend.other"), amount: "65.500 kr", swatch: "bg-muted-foreground/40" },
  ]

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-xl ring-1 ring-black/5 dark:shadow-none dark:ring-white/10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-base font-medium">{t("month")}</h2>
        <span className="text-sm text-muted-foreground">{t("cycle")}</span>
      </div>

      <div className="mt-5 flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{t("netProfit")}</span>
        <span className="text-3xl font-semibold text-emerald-600 tabular-nums dark:text-emerald-500">
          {PREVIEW_SAMPLE.net}
        </span>
      </div>

      <dl className="mt-5 grid grid-cols-2 divide-x divide-border">
        <div className="flex flex-col gap-1 pr-4">
          <dt className="text-sm text-muted-foreground">{t("income")}</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {PREVIEW_SAMPLE.income}
          </dd>
        </div>
        <div className="flex flex-col gap-1 pl-4">
          <dt className="text-sm text-muted-foreground">{t("expenses")}</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {PREVIEW_SAMPLE.expenses}
          </dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-sm font-medium">{t("spendingByType")}</h3>
          <span className="text-sm text-muted-foreground tabular-nums">
            {t("total", { amount: "635.500 kr" })}
          </span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-[48%] bg-emerald-500" />
          <div className="h-full w-[34%] bg-amber-500" />
          <div className="h-full w-[18%] bg-rose-500" />
        </div>
        <ul className="flex flex-col gap-2">
          {legend.map((category) => (
            <li
              key={category.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    category.swatch
                  )}
                  aria-hidden="true"
                />
                <span className="text-muted-foreground">{category.label}</span>
              </span>
              <span className="tabular-nums">{category.amount}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-sm font-medium">{t("spendingByCategory")}</h3>
          <span className="text-sm text-muted-foreground tabular-nums">
            {t("total", { amount: "635.500 kr" })}
          </span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-[33%] bg-sky-500" />
          <div className="h-full w-[24%] bg-violet-500" />
          <div className="h-full w-[19%] bg-teal-500" />
          <div className="h-full w-[14%] bg-fuchsia-500" />
          <div className="h-full w-[10%] bg-muted-foreground/40" />
        </div>
        <ul className="flex flex-col gap-2">
          {categoryLegend.map((category) => (
            <li
              key={category.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn("size-2 shrink-0 rounded-full", category.swatch)}
                  aria-hidden="true"
                />
                <span className="text-muted-foreground">{category.label}</span>
              </span>
              <span className="tabular-nums">{category.amount}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
