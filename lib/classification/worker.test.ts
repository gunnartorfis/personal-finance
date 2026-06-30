import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import { drainPending, type Classifier } from "./worker";

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
  let n = 0;
  const addTxn = (amount: number, merchant = "SHOP") =>
    repo.transactions.create({
      accountId: account.id,
      uploadId: upload.id,
      date: "2026-03-01",
      amount,
      merchant,
      rawCategory: "x",
      sourceRow: n++,
    });
  return { repo, addTxn };
}

const always =
  (expenseType: "Fixed" | "Necessary" | "Nice to have" | ""): Classifier =>
  async () => ({ expenseType, confidence: 0.9, reasoning: "test" });

describe("drainPending", () => {
  it("classifies expense rows via the injected classifier", async () => {
    const { repo, addTxn } = await setup();
    await addTxn(-1990);
    await addTxn(-3200);
    const result = await drainPending(repo, always("Necessary"));
    expect(result).toEqual({ classified: 2, failed: 0 });
    expect(await repo.transactions.listPending()).toHaveLength(0);
  });

  it("does not call the model for credits — marks them not-bucketed", async () => {
    const { repo, addTxn } = await setup();
    const [credit] = await addTxn(5000, "REFUND");
    let calls = 0;
    const counting: Classifier = async () => {
      calls += 1;
      return { expenseType: "Fixed" };
    };
    await drainPending(repo, counting);
    expect(calls).toBe(0);
    expect((await repo.transactions.findById(credit.id))?.expenseType).toBe("");
  });

  it("marks a row failed when the classifier throws, and continues", async () => {
    const { repo, addTxn } = await setup();
    await addTxn(-100);
    const boom: Classifier = async () => {
      throw new Error("model error");
    };
    const result = await drainPending(repo, boom);
    expect(result).toEqual({ classified: 0, failed: 1 });
    expect(await repo.transactions.listPending()).toHaveLength(0); // moved to failed
  });

  it("is resumable — a second drain does nothing once the queue is empty", async () => {
    const { repo, addTxn } = await setup();
    await addTxn(-100);
    await drainPending(repo, always("Fixed"));
    const second = await drainPending(repo, always("Necessary"));
    expect(second).toEqual({ classified: 0, failed: 0 });
  });

  it("respects the batch limit", async () => {
    const { repo, addTxn } = await setup();
    await addTxn(-1);
    await addTxn(-2);
    await addTxn(-3);
    const result = await drainPending(repo, always("Fixed"), { limit: 2 });
    expect(result.classified).toBe(2);
    expect(await repo.transactions.listPending()).toHaveLength(1);
  });
});
