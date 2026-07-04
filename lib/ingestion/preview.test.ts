import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import { headerSignature } from "./column-mapping";
import { RowCapExceededError } from "./parse-csv";
import { ingestUpload } from "./upload";
import { previewUpload } from "./preview";

let db: ReturnType<typeof drizzle>;
const asDb = (d: typeof db) => d as unknown as Parameters<typeof previewUpload>[0];
const ingestDb = (d: typeof db) => d as unknown as Parameters<typeof ingestUpload>[0];
const repoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];
const bytes = (s: string) => new TextEncoder().encode(s);

const HEADER = "Dagsetning,Mótaðili,Tegund,Upphæð";
const csv = (...lines: string[]) => [HEADER, ...lines].join("\n");

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

describe("previewUpload", () => {
  it("previews a clean file: full mapping, all rows new, nothing written", async () => {
    const { householdId, accountId, repo } = await setup();
    const preview = await previewUpload(asDb(db), householdId, {
      accountId,
      bytes: bytes(csv("01.03.2026,NETFLIX,Afþreying,-1.990 kr.", "05.03.2026,BÓNUS,Verslun,-3.200 kr.")),
    });
    expect(preview.status).toBe("ok");
    if (preview.status !== "ok") return;
    expect(preview.unmatchedRoles).toEqual([]);
    expect(preview.detectedMapping).toEqual({ date: 0, merchant: 1, category: 2, amount: 3 });
    expect(preview.rows).toHaveLength(2);
    expect(preview.newCount).toBe(2);
    expect(preview.duplicateCount).toBe(0);
    expect(preview.wholeFileDuplicate).toBe(false);
    // No writes.
    expect(await repo.uploads.list()).toHaveLength(0);
    expect(await repo.transactions.list()).toHaveLength(0);
  });

  it("reports unmatched roles without parsing rows when the mapping is incomplete", async () => {
    const { householdId, accountId } = await setup();
    const preview = await previewUpload(asDb(db), householdId, {
      accountId,
      bytes: bytes("Dagsetning,Mótaðili,Tegund\n01.03.2026,X,Y"),
    });
    expect(preview.status).toBe("ok");
    if (preview.status !== "ok") return;
    expect(preview.unmatchedRoles).toEqual(["amount"]);
    expect(preview.rows).toEqual([]);
    expect(preview.newCount).toBe(0);
  });

  it("counts rows already imported as duplicates in the dry-run", async () => {
    const { householdId, accountId } = await setup();
    const body = csv("01.03.2026,NETFLIX,Afþreying,-1.990 kr.");
    // Ingest the same content once so the dry-run sees it as already-stored.
    await ingestUpload(ingestDb(db), householdId, {
      accountId,
      fileName: "a.csv",
      bytes: bytes(body + "\nX"), // different bytes so the file-hash guard doesn't short-circuit
      rows: [
        { sourceRow: 0, date: "2026-03-01", amount: -1990, merchant: "NETFLIX", rawCategory: "Afþreying" },
      ],
    });
    const preview = await previewUpload(asDb(db), householdId, { accountId, bytes: bytes(body) });
    expect(preview.status).toBe("ok");
    if (preview.status !== "ok") return;
    expect(preview.newCount).toBe(0);
    expect(preview.duplicateCount).toBe(1);
    expect(preview.wholeFileDuplicate).toBe(true); // every row already present
  });

  it("flags an exact re-import of the same file as a whole-file duplicate", async () => {
    const { householdId, accountId } = await setup();
    const file = bytes(csv("01.03.2026,NETFLIX,Afþreying,-1.990 kr."));
    await ingestUpload(ingestDb(db), householdId, {
      accountId,
      fileName: "a.csv",
      bytes: file,
      rows: [
        { sourceRow: 0, date: "2026-03-01", amount: -1990, merchant: "NETFLIX", rawCategory: "Afþreying" },
      ],
    });
    const preview = await previewUpload(asDb(db), householdId, { accountId, bytes: file });
    expect(preview.status).toBe("ok");
    if (preview.status !== "ok") return;
    expect(preview.wholeFileDuplicate).toBe(true);
  });

  it("throws a typed RowCapExceededError for a file past the row cap (route maps it distinctly)", async () => {
    const { householdId, accountId } = await setup();
    const body = Array.from({ length: 20_001 }, () => "01.03.2026,SHOP,Verslun,-100 kr.").join("\n");
    await expect(
      previewUpload(asDb(db), householdId, { accountId, bytes: bytes(csv(body)) }),
    ).rejects.toBeInstanceOf(RowCapExceededError);
  });

  it("resolves columns from a remembered mapping when heuristics can't", async () => {
    const { householdId, accountId, repo } = await setup();
    // A header the alias heuristics don't recognize at all.
    const header = ["Foo", "Bar", "Baz", "Qux"];
    const columns = { date: 0, merchant: 1, category: 2, amount: 3 };
    await repo.columnMappings.upsert(headerSignature(header), columns);

    const preview = await previewUpload(asDb(db), householdId, {
      accountId,
      bytes: bytes([header.join(","), "01.03.2026,NETFLIX,Afþreying,-1.990 kr."].join("\n")),
    });
    expect(preview.status).toBe("ok");
    if (preview.status !== "ok") return;
    expect(preview.unmatchedRoles).toEqual([]);
    expect(preview.detectedMapping).toEqual(columns);
    expect(preview.rows).toHaveLength(1);
    expect(preview.newCount).toBe(1);
  });

  it("surfaces an AI-suggested mapping as source 'ai' when heuristics and remembered miss", async () => {
    const { householdId, accountId } = await setup();
    const suggest = async () => ({ date: 0, merchant: 1, category: 2, amount: 3 });
    const preview = await previewUpload(
      asDb(db),
      householdId,
      { accountId, bytes: bytes(["Foo,Bar,Baz,Qux", "01.03.2026,NETFLIX,Afþreying,-1.990 kr."].join("\n")) },
      suggest,
    );
    expect(preview.status).toBe("ok");
    if (preview.status !== "ok") return;
    expect(preview.mappingSource).toBe("ai");
    expect(preview.unmatchedRoles).toEqual([]);
    expect(preview.rows).toHaveLength(1);
  });

  it("returns unknown-account for an account not in the household", async () => {
    const { householdId } = await setup();
    const preview = await previewUpload(asDb(db), householdId, {
      accountId: "00000000-0000-0000-0000-000000000000",
      bytes: bytes(csv("01.03.2026,NETFLIX,Afþreying,-1.990 kr.")),
    });
    expect(preview.status).toBe("unknown-account");
  });
});
