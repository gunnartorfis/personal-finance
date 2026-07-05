import { createTranslator } from "next-intl"

import { resolveCategoryLabel } from "@/lib/categories/label"
import { currencyFormatter } from "@/lib/format/currency"
import { formatCycleMonth } from "@/lib/format/date"
import { percentFormatter } from "@/lib/format/percent"
import { bcp47, type Locale } from "@/lib/i18n/config"
import en from "@/messages/en.json"
import is from "@/messages/is.json"
import type { RealType } from "@/shared/types"

import type { MonthlyDigestModel } from "../build-monthly"
import { renderMonthlyDigestEmailBody, type DigestRow } from "./monthly-digest-email"

const catalogs: Record<Locale, typeof en> = { en, is }

/** RealType → the full `expenseType` catalog key that labels it (literal keys keep `t` strongly typed). */
const EXPENSE_TYPE_KEY = {
  Fixed: "expenseType.fixed",
  Necessary: "expenseType.necessary",
  "Nice to have": "expenseType.niceToHave",
} as const satisfies Record<RealType, string>

export interface RenderMonthlyDigestInput {
  model: MonthlyDigestModel
  locale: Locale
  /** Auth-less unsubscribe link (signed token generated in slice 6). */
  unsubscribeUrl: string
  /** Deep link back to the dashboard (the re-engagement CTA). */
  dashboardUrl: string
}

export interface RenderedEmail {
  subject: string
  html: string
}

/**
 * Render the Monthly Digest to a localized subject + HTML body (#102, ADR-0019). All copy comes from
 * the message catalogs and all numbers/dates from `lib/format/*` at the given Member's Locale — the
 * Digest is chrome, so it is fully localized (unlike Classification reasoning). Pure: no I/O, no AI.
 */
export function renderMonthlyDigestEmail(input: RenderMonthlyDigestInput): RenderedEmail {
  const { model, locale } = input
  const t = createTranslator({ locale, messages: catalogs[locale] })
  const money = currencyFormatter(model.currency, locale)
  const month = formatCycleMonth(model.cycleKey, locale)

  const headline: DigestRow[] = [
    { label: t("digest.spendingLabel"), value: money.format(model.spending) },
    { label: t("digest.incomeLabel"), value: money.format(model.income) },
    { label: t("digest.differenceLabel"), value: money.format(model.difference) },
  ]

  let vsLastMonth: string | null
  if (model.spendingDelta === null) {
    vsLastMonth = t("digest.firstMonth")
  } else {
    const change =
      model.spendingDelta.pct !== null
        ? percentFormatter(locale, true).format(model.spendingDelta.pct)
        : money.format(model.spendingDelta.abs)
    vsLastMonth = t("digest.vsLastMonth", { pct: change })
  }

  const split: DigestRow[] = model.expenseSplit.map((bucket) => ({
    label: t(EXPENSE_TYPE_KEY[bucket.type]),
    value: money.format(bucket.amount),
  }))

  // Top semantic Categories: seed rows localize via their labelKey (the `categories` catalog), custom
  // rows show their literal label, and the pseudo-rows get their own copy. Value is "amount · share".
  const pct = percentFormatter(locale)
  const categoryLabel = (row: Extract<(typeof model.topCategories)[number], { kind: "category" }>) =>
    resolveCategoryLabel(
      { labelKey: row.labelKey, label: row.label },
      (key) => (catalogs[locale].categories as Record<string, string>)[key] ?? key,
    )
  const categories: DigestRow[] = model.topCategories.map((row) => {
    const label =
      row.kind === "category"
        ? categoryLabel(row)
        : row.kind === "other"
          ? t("digest.categoriesOther", { count: row.count })
          : t("digest.categoriesUncategorized")
    return { label, value: `${money.format(row.amount)} · ${pct.format(row.share)}` }
  })

  const movers = model.topMovers.map((m) => ({
    name: m.name,
    amount: money.format(m.amount),
    delta: t("digest.moverDelta", { delta: money.format(m.delta) }),
  }))

  const savings = model.savings
    ? {
        status: model.savings.onTrack ? t("digest.savingsOnTrack") : t("digest.savingsBehind"),
        allowed: t("digest.allowedNiceToHave", { amount: money.format(model.savings.allowedNiceToHave) }),
      }
    : null

  const html = renderMonthlyDigestEmailBody({
    lang: bcp47[locale],
    heading: t("digest.heading", { month }),
    preheader: t("digest.preheader", { month }),
    headline,
    vsLastMonth,
    splitHeading: t("digest.splitHeading"),
    split,
    categoriesHeading: t("digest.categoriesHeading"),
    categories,
    moversHeading: t("digest.moversHeading"),
    movers,
    savings,
    ctaLabel: t("digest.cta"),
    ctaUrl: input.dashboardUrl,
    unsubscribeLabel: t("digest.unsubscribe"),
    unsubscribeUrl: input.unsubscribeUrl,
    footer: t("digest.footer"),
  })

  return { subject: t("digest.subject", { month }), html }
}
