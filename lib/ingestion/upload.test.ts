import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import { headerSignature } from "./column-mapping";
import type { ParsedRow } from "./parse-csv";
import { ingestUpload } from "./upload";

let db: ReturnType<typeof drizzle>;
const asDb = (d: typeof db) => d as unknown as Parameters<typeof ingestUpload>[0];
const repoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];
const bytes = (s: string) => new TextEncoder().encode(s);
const row = (sourceRow: number, amount: number, merchant: string): ParsedRow => ({
  sourceRow,
  date: "2026-03-01",
  amount,
  merchant,
  rawCategory: "Verslun",
});

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

async function setup() {
  const [hh] = await db.insert(households).values({}).returning();
  const repo = householdRepo(repoDb(db), hh.id);
  const [account] = await repo.accounts.create({ name: "Visa" });
  return { householdId: hh.id, accountId: account.id, repo };
}

describe("ingestUpload", () => {
  it("registers the upload and appends its rows as pending transactions", async () => {
    const { householdId, accountId, repo } = await setup();
    const result = await ingestUpload(asDb(db), householdId, {
      accountId,
      fileName: "mar.csv",
      bytes: bytes("file-a"),
      rows: [row(0, -1990, "NETFLIX"), row(1, -3200, "BONUS")],
    });
    expect(result.status).toBe("created");
    if (result.status === "created") expect(result.appended).toBe(2);
    expect(await repo.uploads.list()).toHaveLength(1);
    expect(await repo.transactions.list()).toHaveLength(2);
  });

  it("reports an exact re-import as a duplicate", async () => {
    const { householdId, accountId, repo } = await setup();
    const file = bytes("dup-file");
    await ingestUpload(asDb(db), householdId, {
      accountId,
      fileName: "a.csv",
      bytes: file,
      rows: [row(0, -1, "X")],
    });
    const second = await ingestUpload(asDb(db), householdId, {
      accountId,
      fileName: "a2.csv",
      bytes: file,
      rows: [row(0, -1, "X")],
    });
    expect(second.status).toBe("duplicate");
    expect(await repo.uploads.list()).toHaveLength(1);
  });

  it("reports an account not in the household", async () => {
    const { householdId } = await setup();
    const result = await ingestUpload(asDb(db), householdId, {
      accountId: "00000000-0000-0000-0000-000000000000",
      fileName: "a.csv",
      bytes: bytes("z"),
      rows: [],
    });
    expect(result.status).toBe("unknown-account");
  });

  it("rolls back the upload if appending rows fails (atomic)", async () => {
    const { householdId, accountId, repo } = await setup();
    const badRow: ParsedRow = {
      sourceRow: 0,
      date: "not-a-date",
      amount: -1,
      merchant: "X",
      rawCategory: "Y",
    };
    await expect(
      ingestUpload(asDb(db), householdId, {
        accountId,
        fileName: "bad.csv",
        bytes: bytes("bad-file"),
        rows: [badRow],
      }),
    ).rejects.toThrow();
    // Neither the upload nor any transaction is persisted — and the file hash isn't locked.
    expect(await repo.uploads.list()).toHaveLength(0);
    expect(await repo.transactions.list()).toHaveLength(0);
  });

  it("remembers the confirmed column mapping on a created import", async () => {
    const { householdId, accountId, repo } = await setup();
    const columns = { date: 0, merchant: 1, category: 2, amount: 3 };
    const sig = headerSignature(["Foo", "Bar", "Baz", "Qux"]);
    const result = await ingestUpload(asDb(db), householdId, {
      accountId,
      fileName: "a.csv",
      bytes: bytes("remember-file"),
      rows: [row(0, -1, "X")],
      rememberMapping: { headerSignature: sig, columns },
    });
    expect(result.status).toBe("created");
    expect((await repo.columnMappings.findBySignature(sig))?.columns).toEqual(columns);
  });

  it("does not remember a mapping when none is supplied (auto-detected import)", async () => {
    const { householdId, accountId, repo } = await setup();
    await ingestUpload(asDb(db), householdId, {
      accountId,
      fileName: "b.csv",
      bytes: bytes("no-remember"),
      rows: [row(0, -1, "X")],
    });
    expect(await repo.columnMappings.findBySignature(headerSignature(["Foo", "Bar"]))).toBeUndefined();
  });
});
