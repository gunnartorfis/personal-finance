import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import { createUpload } from "./upload";

let db: ReturnType<typeof drizzle>;
const asDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];
const bytes = (s: string) => new TextEncoder().encode(s);

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

/** A fresh household with one account, and a repo scoped to it. */
async function newHouseholdWithAccount() {
  const [hh] = await db.insert(households).values({}).returning();
  const repo = householdRepo(asDb(db), hh.id);
  const [account] = await repo.accounts.create({ name: "Visa" });
  return { repo, accountId: account.id };
}

describe("createUpload", () => {
  it("registers a new upload with its file hash", async () => {
    const { repo, accountId } = await newHouseholdWithAccount();
    const result = await createUpload(repo, {
      accountId,
      fileName: "mar.csv",
      bytes: bytes("Dagsetning,Mótaðili\n01.03.2026,NETFLIX\n"),
    });
    expect(result.status).toBe("created");
    expect(await repo.uploads.list()).toHaveLength(1);
  });

  it("flags a byte-identical re-upload as a duplicate (exact-file guard)", async () => {
    const { repo, accountId } = await newHouseholdWithAccount();
    const file = bytes("same bytes");
    const first = await createUpload(repo, { accountId, fileName: "a.csv", bytes: file });
    const second = await createUpload(repo, { accountId, fileName: "a-again.csv", bytes: file });
    expect(first.status).toBe("created");
    expect(second.status).toBe("duplicate");
    expect(await repo.uploads.list()).toHaveLength(1);
  });

  it("treats a one-byte-different file as a new upload", async () => {
    const { repo, accountId } = await newHouseholdWithAccount();
    await createUpload(repo, { accountId, fileName: "a.csv", bytes: bytes("content") });
    const res = await createUpload(repo, { accountId, fileName: "b.csv", bytes: bytes("content ") });
    expect(res.status).toBe("created");
    expect(await repo.uploads.list()).toHaveLength(2);
  });

  it("rejects an account that is not in the household", async () => {
    const { repo } = await newHouseholdWithAccount();
    const NONEXISTENT = "00000000-0000-0000-0000-000000000000";
    const res = await createUpload(repo, { accountId: NONEXISTENT, fileName: "a.csv", bytes: bytes("x") });
    expect(res.status).toBe("unknown-account");
    expect(await repo.uploads.list()).toHaveLength(0);
  });

  it("does not let one household upload to another household's account", async () => {
    const a = await newHouseholdWithAccount();
    const b = await newHouseholdWithAccount();
    // b's repo cannot use a's accountId (scoped lookup returns nothing).
    const res = await createUpload(b.repo, { accountId: a.accountId, fileName: "x.csv", bytes: bytes("y") });
    expect(res.status).toBe("unknown-account");
  });

  it("handles a concurrent upload of the same file without a duplicate row (TOCTOU)", async () => {
    const { repo, accountId } = await newHouseholdWithAccount();
    const file = bytes("racing file");
    const results = await Promise.all([
      createUpload(repo, { accountId, fileName: "x.csv", bytes: file }),
      createUpload(repo, { accountId, fileName: "x.csv", bytes: file }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual(["created", "duplicate"]);
    expect(await repo.uploads.list()).toHaveLength(1);
  });
});
