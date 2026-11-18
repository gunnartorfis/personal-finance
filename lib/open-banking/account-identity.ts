import { createHash } from "node:crypto";

/** Compare bank-supplied IBANs without storing the full identifiers. */
export function bankAccountFingerprint(iban: string | undefined): string | null {
  const normalized = iban?.replace(/\s/g, "").toUpperCase();
  if (!normalized || !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(normalized)) return null;
  return createHash("sha256").update(normalized).digest("hex");
}

/** Require a complete, valid IBAN before using it for a persistent counterparty rule. */
export function counterpartyAccountFingerprint(iban: string | undefined): string | null {
  const normalized = iban?.replace(/\s/g, "").toUpperCase();
  if (!normalized || !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(normalized)) return null;
  if (normalized.startsWith("IS") && !/^IS\d{24}$/.test(normalized)) return null;
  let remainder = 0;
  for (const character of normalized.slice(4) + normalized.slice(0, 4)) {
    const value = character.charCodeAt(0);
    remainder = value >= 65
      ? (remainder * 100 + value - 55) % 97
      : (remainder * 10 + value - 48) % 97;
  }
  return remainder === 1 ? bankAccountFingerprint(normalized) : null;
}

export function knownCounterparties(
  rows: ReadonlyArray<{ externalId: string; counterpartyIban?: string }>,
): Map<string, string> {
  const entries = new Map<string, string>();
  for (const row of rows) {
    const fingerprint = counterpartyAccountFingerprint(row.counterpartyIban);
    if (fingerprint) entries.set(row.externalId, fingerprint);
  }
  return entries;
}
