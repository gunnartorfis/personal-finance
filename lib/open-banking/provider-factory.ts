import { EnableBankingClient } from "./enable-banking";
import type { IngestionProvider } from "./provider";

/**
 * Resolve the configured open-banking provider from the environment (slice #113). Enable Banking
 * needs an application id + RSA private key (PEM) from its control panel. Throws a clear error when
 * unconfigured so a missing-credentials misconfiguration fails loudly rather than silently.
 *
 * Env:
 *   ENABLE_BANKING_APPLICATION_ID  — the app id (JWT `kid`)
 *   ENABLE_BANKING_PRIVATE_KEY     — RSA private key PEM (literal `\n` escapes are un-escaped)
 *   ENABLE_BANKING_BASE_URL        — optional API root override
 */
export function getIngestionProvider(): IngestionProvider {
  const applicationId = process.env.ENABLE_BANKING_APPLICATION_ID;
  const privateKey = process.env.ENABLE_BANKING_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!applicationId || !privateKey) {
    throw new Error(
      "Enable Banking is not configured (set ENABLE_BANKING_APPLICATION_ID and ENABLE_BANKING_PRIVATE_KEY).",
    );
  }
  return new EnableBankingClient({
    applicationId,
    privateKey,
    baseUrl: process.env.ENABLE_BANKING_BASE_URL,
  });
}
