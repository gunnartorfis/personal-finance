const formatters = new Map<string, Intl.NumberFormat>();

/**
 * A memoized whole-amount currency formatter (en-US, no fraction digits) — one `Intl.NumberFormat`
 * instance per currency, shared across renders and components rather than re-created each time. The
 * dashboard bucket amounts are whole units in the Household's billing currency (ADR-0004).
 */
export function currencyFormatter(currency: string): Intl.NumberFormat {
  const cached = formatters.get(currency);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
  formatters.set(currency, formatter);
  return formatter;
}
