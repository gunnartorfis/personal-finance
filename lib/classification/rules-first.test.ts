import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import { applyRulesFirst } from "./rules-first";

let db: ReturnType<typeof drizzle>;
const asDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];

beforeAll(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: "./drizzle" });
});

async function setup() {
  const [hh] = await db.insert(households).values({}).returning();
  const repo = householdRepo(asDb(db), hh.id);
  const [account] = await repo.accounts.create({ name: "Visa" });
  const [upload] = await repo.uploads.create({
    accountId: account.id,
    fileName: "f.csv",
    fileHash: `h-${hh.id}`,
  });
  const addTxn = (merchant: string, amount: number, sourceRow: number) =>
    repo.transactions.create({
      accountId: account.id,
      uploadId: upload.id,
      date: "2026-03-01",
      amount,
      merchant,
      rawCategory: "x",
      sourceRow,
    });
  return { repo, addTxn };
}

describe("applyRulesFirst", () => {
  it("classifies a rule-matched row and leaves unmatched rows pending", async () => {
    const { repo, addTxn } = await setup();
    await repo.merchantRules.create({ merchant: "NETFLIX", flatType: "Fixed" });
    await addTxn("NETFLIX", -1990, 0);
    await addTxn("OBSCURE SHOP", -500, 1);

    const result = await applyRulesFirst(repo);

    expect(result).toEqual({ classified: 1, remaining: 1 });
    const pending = await repo.transactions.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].merchant).toBe("OBSCURE SHOP");
  });

  it("applies an amount-threshold split rule and records it as a rule match", async () => {
    const { repo, addTxn } = await setup();
    await repo.merchantRules.create({
      merchant: "WORLD CLASS",
      threshold: 8000,
      atOrAboveType: "Fixed",
      belowType: "Nice to have",
    });
    const [txn] = await addTxn("WORLD CLASS", -9000, 0);

    await applyRulesFirst(repo);

    const classified = await repo.transactions.findById(txn.id);
    expect(classified?.classificationStatus).toBe("classified");
    expect(classified?.expenseType).toBe("Fixed");
    expect(classified?.reasoning).toBe("merchant rule");
  });

  it("skips a row that already has a manual override", async () => {
    const { repo, addTxn } = await setup();
    await repo.merchantRules.create({ merchant: "NETFLIX", flatType: "Fixed" });
    const [txn] = await addTxn("NETFLIX", -1990, 0);
    await repo.overrides.upsert({ transactionId: txn.id, expenseType: "Nice to have" });

    const result = await applyRulesFirst(repo);

    expect(result.classified).toBe(0); // override wins on read — don't record the rule's type
    expect((await repo.transactions.findById(txn.id))?.classificationStatus).toBe("pending");
  });

  it("does nothing when there are no rules", async () => {
    const { repo, addTxn } = await setup();
    await addTxn("ANYTHING", -100, 0);
    const result = await applyRulesFirst(repo);
    expect(result).toEqual({ classified: 0, remaining: 1 });
  });

  it("leaves a credit (positive amount) pending even if a merchant rule matches", async () => {
    const { repo, addTxn } = await setup();
    await repo.merchantRules.create({ merchant: "NETFLIX", flatType: "Fixed" });
    await addTxn("NETFLIX", 1990, 0); // a refund — credits are not bucketed by rules
    const result = await applyRulesFirst(repo);
    expect(result.classified).toBe(0);
    expect(await repo.transactions.listPending()).toHaveLength(1);
  });
});
