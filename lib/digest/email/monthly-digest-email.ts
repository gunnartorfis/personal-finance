/** A label/value pair rendered as a row (spend, income, difference, or an expense bucket). */
export interface DigestRow {
  label: string
  value: string
}

/** Fully-resolved, already-localized props — the builder does no formatting or translation itself. */
export interface MonthlyDigestEmailProps {
  /** BCP-47 tag for the document `lang` (e.g. `is-IS`, `en-US`). */
  lang: string
  heading: string
  preheader: string
  /** Spent / Income / Difference. */
  headline: DigestRow[]
  /** The vs-prior-cycle line, or null on a Household's first tracked month. */
  vsLastMonth: string | null
  splitHeading: string
  split: DigestRow[]
  /** Top semantic Categories for the cycle (label + formatted "amount · share"); empty hides the section. */
  categoriesHeading: string
  categories: DigestRow[]
  moversHeading: string
  /** Rising merchants (name + formatted amount + formatted "+X more"); empty hides the section. */
  movers: { name: string; amount: string; delta: string }[]
  /** Savings status line + allowed-nice-to-have line; null when the Household has no goal. */
  savings: { status: string; allowed: string } | null
  ctaLabel: string
  ctaUrl: string
  unsubscribeLabel: string
  unsubscribeUrl: string
  footer: string
}

/** Escape every interpolated value — merchant names and figures are data, so this is XSS-safe by construction. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

const colors = {
  bg: "#f5f5f4",
  card: "#ffffff",
  text: "#1c1917",
  muted: "#78716c",
  border: "#e7e5e4",
  accent: "#0f766e",
}

// Inline CSS strings (email-safe; table layout, no flexbox for Outlook's Word engine).
const css = {
  body: `margin:0;padding:24px 0;background-color:${colors.bg}`,
  container: `max-width:560px;margin:0 auto;padding:32px;background-color:${colors.card};border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${colors.text}`,
  heading: "font-size:22px;font-weight:700;margin:0 0 4px",
  muted: `color:${colors.muted};font-size:14px;margin:0 0 24px`,
  sectionTitle: `font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${colors.muted};margin:24px 0 8px`,
  table: "width:100%;border-collapse:collapse",
  cell: `padding:8px 0;border-bottom:1px solid ${colors.border};font-size:15px;vertical-align:top`,
  cellValue: `padding:8px 0;border-bottom:1px solid ${colors.border};font-size:15px;font-weight:600;vertical-align:top`,
  savings: `margin:24px 0 0;padding:16px;background-color:${colors.bg};border-radius:8px;font-size:15px`,
  cta: `display:inline-block;margin:24px 0 0;padding:12px 20px;background-color:${colors.accent};color:#ffffff;border-radius:8px;font-weight:600;text-decoration:none`,
  footer: `color:${colors.muted};font-size:12px;margin:32px 0 0;line-height:1.5`,
  muteLink: `color:${colors.muted}`,
  preheader: "display:none;max-height:0;overflow:hidden;opacity:0",
}

/** A two-column label/value table — table-based so Outlook keeps the value beside its label. */
function rowsTable(rows: DigestRow[]): string {
  const body = rows
    .map(
      (r) =>
        `<tr><td style="${css.cell}">${esc(r.label)}</td><td align="right" style="${css.cellValue}">${esc(r.value)}</td></tr>`,
    )
    .join("")
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${css.table}"><tbody>${body}</tbody></table>`
}

function section(title: string, rows: DigestRow[]): string {
  if (rows.length === 0) return ""
  return `<p style="${css.sectionTitle}">${esc(title)}</p>${rowsTable(rows)}`
}

/**
 * The Monthly Digest email body (#102, ADR-0019). Pure: every string is pre-localized and every
 * number pre-formatted by {@link renderMonthlyDigestEmail}, so this holds no translation/Intl logic.
 * A plain escaped HTML string (no react-dom/server — the App Router forbids it in the route graph),
 * table-based + inline-styled for email-client safety, with a `<head>` charset for Icelandic text.
 */
export function renderMonthlyDigestEmailBody(props: MonthlyDigestEmailProps): string {
  const movers = props.movers.map((m) => ({ label: m.name, value: `${m.amount} (${m.delta})` }))
  const savings = props.savings
    ? `<div style="${css.savings}"><p style="margin:0 0 8px">${esc(props.savings.status)}</p><p style="margin:0;font-weight:600">${esc(props.savings.allowed)}</p></div>`
    : ""
  const vsLast = props.vsLastMonth ? `<p style="${css.muted}">${esc(props.vsLastMonth)}</p>` : ""

  return (
    `<!DOCTYPE html><html lang="${esc(props.lang)}">` +
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"></head>` +
    `<body style="${css.body}">` +
    `<span style="${css.preheader}">${esc(props.preheader)}</span>` +
    `<div style="${css.container}">` +
    `<h1 style="${css.heading}">${esc(props.heading)}</h1>` +
    vsLast +
    rowsTable(props.headline) +
    section(props.splitHeading, props.split) +
    section(props.categoriesHeading, props.categories) +
    section(props.moversHeading, movers) +
    savings +
    `<div><a href="${esc(props.ctaUrl)}" style="${css.cta}">${esc(props.ctaLabel)}</a></div>` +
    `<p style="${css.footer}">${esc(props.footer)}<br><a href="${esc(props.unsubscribeUrl)}" style="${css.muteLink}">${esc(props.unsubscribeLabel)}</a></p>` +
    `</div></body></html>`
  )
}
