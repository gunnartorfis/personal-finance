import { createHash } from "node:crypto";

/** Compare bank-supplied IBANs without storing the full identifiers. */
export function bankAccountFingerprint(iban: string | undefined): string | null {
  const normalized = iban?.replace(/\s/g, "").toUpperCase();
  if (!normalized || !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(normalized)) return null;
  return createHash("sha256").update(normalized).digest("hex");
}
