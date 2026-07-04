import type { CSSProperties } from "react"

/** A label/value pair rendered as a row (spend, income, difference, or an expense bucket). */
export interface DigestRow {
  label: string
  value: string
}

/** Fully-resolved, already-localized props — the component does no formatting or translation itself. */
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

const colors = {
  bg: "#f5f5f4",
  card: "#ffffff",
  text: "#1c1917",
  muted: "#78716c",
  border: "#e7e5e4",
  accent: "#0f766e",
}

const styles = {
  body: { margin: 0, padding: "24px 0", backgroundColor: colors.bg } as CSSProperties,
  container: {
    maxWidth: "560px",
    margin: "0 auto",
    padding: "32px",
    backgroundColor: colors.card,
    borderRadius: "12px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    color: colors.text,
  } as CSSProperties,
  heading: { fontSize: "22px", fontWeight: 700, margin: "0 0 4px" } as CSSProperties,
  muted: { color: colors.muted, fontSize: "14px", margin: "0 0 24px" } as CSSProperties,
  sectionTitle: {
    fontSize: "13px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: colors.muted,
    margin: "24px 0 8px",
  } as CSSProperties,
  row: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: `1px solid ${colors.border}`,
    fontSize: "15px",
  } as CSSProperties,
  rowValue: { fontWeight: 600 } as CSSProperties,
  savings: {
    margin: "24px 0 0",
    padding: "16px",
    backgroundColor: colors.bg,
    borderRadius: "8px",
    fontSize: "15px",
  } as CSSProperties,
  cta: {
    display: "inline-block",
    margin: "24px 0 0",
    padding: "12px 20px",
    backgroundColor: colors.accent,
    color: "#ffffff",
    borderRadius: "8px",
    fontWeight: 600,
    textDecoration: "none",
  } as CSSProperties,
  footer: { color: colors.muted, fontSize: "12px", margin: "32px 0 0", lineHeight: 1.5 } as CSSProperties,
  unsubscribe: { color: colors.muted } as CSSProperties,
  preheader: {
    display: "none",
    maxHeight: 0,
    overflow: "hidden",
    opacity: 0,
  } as CSSProperties,
} satisfies Record<string, CSSProperties>

function Row({ label, value }: DigestRow) {
  return (
    <div style={styles.row}>
      <span>{label}</span>
      <span style={styles.rowValue}>{value}</span>
    </div>
  )
}

/**
 * The Monthly Digest email body (#102, ADR-0019). Pure and presentational: every string is
 * pre-localized and every number pre-formatted by {@link renderMonthlyDigestEmail}, so this file
 * carries no translation or Intl logic. Inline styles + a simple block layout keep it email-safe.
 */
export function MonthlyDigestEmail(props: MonthlyDigestEmailProps) {
  return (
    <html lang={props.lang}>
      <body style={styles.body}>
        <span style={styles.preheader}>{props.preheader}</span>
        <div style={styles.container}>
          <h1 style={styles.heading}>{props.heading}</h1>
          {props.vsLastMonth ? <p style={styles.muted}>{props.vsLastMonth}</p> : null}

          {props.headline.map((r) => (
            <Row key={r.label} label={r.label} value={r.value} />
          ))}

          {props.split.length > 0 ? (
            <>
              <p style={styles.sectionTitle}>{props.splitHeading}</p>
              {props.split.map((r) => (
                <Row key={r.label} label={r.label} value={r.value} />
              ))}
            </>
          ) : null}

          {props.movers.length > 0 ? (
            <>
              <p style={styles.sectionTitle}>{props.moversHeading}</p>
              {props.movers.map((m) => (
                <div key={m.name} style={styles.row}>
                  <span>{m.name}</span>
                  <span style={styles.rowValue}>
                    {m.amount} <span style={styles.unsubscribe}>({m.delta})</span>
                  </span>
                </div>
              ))}
            </>
          ) : null}

          {props.savings ? (
            <div style={styles.savings}>
              <p style={{ margin: "0 0 8px" }}>{props.savings.status}</p>
              <p style={{ margin: 0, fontWeight: 600 }}>{props.savings.allowed}</p>
            </div>
          ) : null}

          <div>
            <a href={props.ctaUrl} style={styles.cta}>
              {props.ctaLabel}
            </a>
          </div>

          <p style={styles.footer}>
            {props.footer}
            <br />
            <a href={props.unsubscribeUrl} style={styles.unsubscribe}>
              {props.unsubscribeLabel}
            </a>
          </p>
        </div>
      </body>
    </html>
  )
}
