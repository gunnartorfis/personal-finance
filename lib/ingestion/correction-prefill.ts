/**
 * Best-effort pre-fill for the "Fix & import" editor (ADR-0025): turn a couldn't-read row's raw
 * cells into input-ready values — an ISO `date` for a date input, an integer `amount` string for a
 * number input, and a trimmed `merchant`. Anything unparseable becomes "" for the Member to supply.
 * Deliberately lenient (mirrors the deterministic parser's cleanup) — the server re-validates.
 */
export interface CorrectionPrefill {
  date: string;
  amount: string;
  merchant: string;
}

function prefillDate(raw: string): string {
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dmy = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : "";
}

function prefillAmount(raw: string): string {
  const cleaned = raw.replace("kr.", "").replace(/\./g, "").replace(/\s/g, "").trim();
  return /^-?\d+$/.test(cleaned) ? cleaned : "";
}

export function prefillCorrection(raw: {
  date: string;
  amount: string;
  merchant: string;
}): CorrectionPrefill {
  return {
    date: prefillDate(raw.date),
    amount: prefillAmount(raw.amount),
    merchant: raw.merchant.trim(),
  };
}
