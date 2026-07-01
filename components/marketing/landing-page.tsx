import {
  ArrowRight,
  CalendarRange,
  Check,
  LineChart,
  PenLine,
  PiggyBank,
  Sparkles,
  SlidersHorizontal,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react"
import Link from "next/link"
import type { ComponentType, ReactNode, SVGProps } from "react"

import { cn } from "@/lib/utils"

/**
 * Public marketing page for signed-out visitors (the logged-in root redirects to the dashboard).
 * A server component — pure markup and links, no client state — so it renders statically and the
 * auth-gated root page (`app/page.tsx`) can decide which to show. Copy and layout follow the
 * product's own language (Household, Statement cycle, Expense type) and reuse the app's design
 * tokens so the marketing surface reads as the same product as the dashboard behind it.
 */

const SIGN_UP_HREF = "/auth/sign-up"
const SIGN_IN_HREF = "/auth/sign-in"

type Feature = {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  title: string
  body: string
}

const STEPS: Feature[] = [
  {
    icon: Upload,
    title: "Upload your statement",
    body: "Export your card statement as CSV and drop it in. Map the columns once and every future upload just works.",
  },
  {
    icon: Sparkles,
    title: "Let AI sort it",
    body: "Claude reads every transaction and buckets it — Fixed, Necessary, or Nice to have — with a confidence score.",
  },
  {
    icon: TrendingUp,
    title: "Track your net",
    body: "Watch combined net profit across the whole household, statement cycle by statement cycle.",
  },
]

const FEATURES: Feature[] = [
  {
    icon: Sparkles,
    title: "AI classification",
    body: "Every transaction typed automatically, with the reasoning and confidence behind each call.",
  },
  {
    icon: LineChart,
    title: "Real net profit",
    body: "Income minus card spending minus fixed bills — one honest number per statement cycle.",
  },
  {
    icon: Users,
    title: "Shared by household",
    body: "One financial picture for a couple or family. Everyone uploads, everyone sees the whole.",
  },
  {
    icon: SlidersHorizontal,
    title: "Merchant rules",
    body: "Teach it once. A rule like “Netflix is Nice to have” sticks for every future upload.",
  },
  {
    icon: PenLine,
    title: "Your call always wins",
    body: "Disagree with a classification? Override any row and your choice takes precedence.",
  },
  {
    icon: CalendarRange,
    title: "Statement cycles",
    body: "Set your card’s cutoff day so every total lines up with the statement you actually pay.",
  },
]

type Plan = {
  name: string
  price: string
  cadence: string | null
  description: string
  features: string[]
  cta: string
  emphasized: boolean
  note?: string
}

const PLANS: Plan[] = [
  {
    name: "Free",
    price: "0 kr",
    cadence: null,
    description: "For a first honest look at where the money goes.",
    features: [
      "Your first 50 classified transactions",
      "Unlimited uploads and overrides",
      "Net profit tracking",
      "Household sharing",
    ],
    cta: "Start for free",
    emphasized: false,
  },
  {
    name: "Premium",
    price: "1.990 kr",
    cadence: "/mo",
    description: "For staying on top of it, every single month.",
    features: [
      "Everything in Free",
      "Up to ~25,000 classifications per month",
      "Merchant rules for hands-off typing",
      "Priority classification",
    ],
    cta: "Go Premium",
    emphasized: true,
    note: "Save 30% billed annually.",
  },
]

const PREVIEW_LEGEND = [
  { label: "Fixed", amount: "305.000 kr", swatch: "bg-emerald-500" },
  { label: "Necessary", amount: "216.500 kr", swatch: "bg-amber-500" },
  { label: "Nice to have", amount: "114.000 kr", swatch: "bg-rose-500" },
] as const

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

export function LandingPage() {
  return (
    <div className="isolate flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            aria-label="Homepage"
            className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Wordmark className="text-base" />
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href={SIGN_IN_HREF}
              className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Sign in
            </Link>
            <PrimaryCta href={SIGN_UP_HREF} className="h-9 px-4">
              Get started
            </PrimaryCta>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero — left-aligned split: pitch on the left, a live-looking dashboard card on the right. */}
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
                Personal finance for households
              </p>
              <h1 className="max-w-[20ch] text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                See where the money actually goes.
              </h1>
              <p className="max-w-[48ch] text-lg text-pretty text-muted-foreground">
                Upload your card statements and let AI sort every transaction
                into Fixed, Necessary, and Nice to have — then watch your
                household’s real net profit, statement cycle after statement
                cycle.
              </p>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <PrimaryCta href={SIGN_UP_HREF} className="w-full sm:w-auto">
                  Start for free
                  <ArrowRight className="size-4" aria-hidden="true" />
                </PrimaryCta>
                <SecondaryCta href={SIGN_IN_HREF} className="w-full sm:w-auto">
                  Sign in
                </SecondaryCta>
              </div>
              <p className="text-sm text-muted-foreground">
                Free for your first 50 classified transactions. No card
                required.
              </p>
            </div>

            <ProductPreview />
          </div>
        </section>

        {/* How it works — left-aligned three-step walkthrough. */}
        <section className="border-t border-border py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-primary">How it works</p>
              <h2 className="max-w-[24ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                From raw statement to real number in minutes.
              </h2>
            </div>
            <ol
              role="list"
              className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3"
            >
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="flex flex-col items-start gap-3"
                >
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

        {/* Features — left-aligned description list of what the product does. */}
        <section className="border-t border-border py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-primary">Features</p>
              <h2 className="max-w-[26ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Everything a household needs to stay honest with itself.
              </h2>
            </div>
            <dl className="mt-12 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="flex flex-col gap-2">
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
        </section>

        {/* Pricing — centered on a recessed background to separate it from the left-aligned sections. */}
        <section className="border-t border-border bg-muted/40 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-sm font-medium text-primary">Pricing</p>
              <h2 className="mx-auto max-w-[22ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Start free. Upgrade when it earns its keep.
              </h2>
              <p className="mx-auto max-w-[46ch] text-lg text-pretty text-muted-foreground">
                The Free plan classifies your first 50 transactions for good.
                Premium keeps every statement cycle sorted.
              </p>
            </div>
            <div className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-8 sm:grid-cols-2">
              {PLANS.map((plan) => (
                <div
                  key={plan.name}
                  className="flex flex-col justify-between gap-8 rounded-2xl border border-border bg-card p-6"
                >
                  <div className="flex flex-col gap-5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-medium">{plan.name}</h3>
                      {plan.emphasized && (
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                          Recommended
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1">
                      <div className="text-4xl font-semibold tracking-tight tabular-nums">
                        {plan.price}
                      </div>
                      {plan.cadence && (
                        <div className="text-base font-normal text-muted-foreground">
                          {plan.cadence}
                        </div>
                      )}
                    </div>
                    <p className="text-base text-pretty text-muted-foreground">
                      {plan.description}
                    </p>
                    <ul role="list" className="flex flex-col gap-3">
                      {plan.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2 text-base text-muted-foreground"
                        >
                          <Check
                            className="size-4 h-lh shrink-0 text-primary"
                            aria-hidden="true"
                          />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex flex-col gap-3">
                    {plan.emphasized ? (
                      <PrimaryCta href={SIGN_UP_HREF} className="w-full">
                        {plan.cta}
                      </PrimaryCta>
                    ) : (
                      <SecondaryCta href={SIGN_UP_HREF} className="w-full">
                        {plan.cta}
                      </SecondaryCta>
                    )}
                    {plan.note && (
                      <p className="text-center text-sm text-muted-foreground">
                        {plan.note}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA — centered, echoing the hero's single conversion action. */}
        <section className="border-t border-border py-20 sm:py-28">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 text-center">
            <h2 className="mx-auto max-w-[22ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Ready to see your real number?
            </h2>
            <p className="mx-auto max-w-[42ch] text-lg text-pretty text-muted-foreground">
              It takes one CSV and a couple of minutes to find out.
            </p>
            <PrimaryCta href={SIGN_UP_HREF}>
              Start for free
              <ArrowRight className="size-4" aria-hidden="true" />
            </PrimaryCta>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <Wordmark className="text-base" />
            <p className="text-sm text-muted-foreground">
              Personal finance for households.
            </p>
          </div>
          <nav className="flex items-center gap-5">
            <Link
              href={SIGN_IN_HREF}
              className="text-sm font-normal text-muted-foreground hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              href={SIGN_UP_HREF}
              className="text-sm font-normal text-muted-foreground hover:text-foreground"
            >
              Get started
            </Link>
            <a
              href="https://github.com/gunnartorfis/personal-finance"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-normal text-muted-foreground hover:text-foreground"
            >
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </div>
  )
}

/**
 * A static, illustrative dashboard card for the hero — mirrors the real {@link NetSummaryCard}
 * (net profit + income/expenses split + spending-by-type bar) with representative figures so the
 * hero shows the actual product surface rather than a stock screenshot. Decorative only.
 */
function ProductPreview() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-xl ring-1 ring-black/5 dark:shadow-none dark:ring-white/10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-base font-medium">Jun 2026</h2>
        <span className="text-sm text-muted-foreground">Statement cycle</span>
      </div>

      <div className="mt-5 flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Net profit</span>
        <span className="text-3xl font-semibold text-emerald-600 tabular-nums dark:text-emerald-500">
          +284.500 kr
        </span>
      </div>

      <dl className="mt-5 grid grid-cols-2 divide-x divide-border">
        <div className="flex flex-col gap-1 pr-4">
          <dt className="text-sm text-muted-foreground">Income</dt>
          <dd className="text-lg font-semibold tabular-nums">920.000 kr</dd>
        </div>
        <div className="flex flex-col gap-1 pl-4">
          <dt className="text-sm text-muted-foreground">Expenses</dt>
          <dd className="text-lg font-semibold tabular-nums">635.500 kr</dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-sm font-medium">Spending by type</h3>
          <span className="text-sm text-muted-foreground tabular-nums">
            635.500 kr total
          </span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-[48%] bg-emerald-500" />
          <div className="h-full w-[34%] bg-amber-500" />
          <div className="h-full w-[18%] bg-rose-500" />
        </div>
        <ul role="list" className="flex flex-col gap-2">
          {PREVIEW_LEGEND.map((category) => (
            <li
              key={category.label}
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
    </div>
  )
}
