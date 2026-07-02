import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getIngestionProvider } from "./provider-factory";

const KEYS = [
  "ENABLE_BANKING_APPLICATION_ID",
  "ENABLE_BANKING_PRIVATE_KEY",
  "ENABLE_BANKING_BASE_URL",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("getIngestionProvider", () => {
  it("throws a clear error when Enable Banking is not configured", () => {
    expect(() => getIngestionProvider()).toThrow(/not configured/i);
  });

  it("returns the Enable Banking provider when configured", () => {
    process.env.ENABLE_BANKING_APPLICATION_ID = "app-123";
    process.env.ENABLE_BANKING_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nX\\n-----END PRIVATE KEY-----";
    expect(getIngestionProvider().name).toBe("enable_banking");
  });
});
