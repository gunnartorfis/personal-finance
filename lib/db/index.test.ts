import { afterEach, describe, expect, it } from "vitest";

import { closeDb, getDb } from "./index";

describe("getDb / closeDb", () => {
  afterEach(async () => {
    await closeDb();
  });

  it("closeDb is a safe no-op when no pool has been opened", async () => {
    await expect(closeDb()).resolves.toBeUndefined();
  });

  it("getDb throws a clear error when DATABASE_URL is not set", () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(() => getDb()).toThrow(/DATABASE_URL/);
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  });
});
