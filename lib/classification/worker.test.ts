import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { seedCategoriesForHousehold } from "@/lib/categories/seed-household";
import { householdRepo } from "@/lib/db/household-repo";
import { categories, households, transactions } from "@/lib/db/schema";

import { REUSED_REASON } from "./reasons";
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
  return { repo, addTxn, householdId: hh.id, accountId: account.id, uploadId: upload.id };
}

const always =
  (expenseType: "Fixed" | "Necessary" | "Nice to have" | ""): Classifier =>
  async () => ({ expenseType, confidence: 0.9, reasoning: "test" });

describe("drainPending", () => {
  it("classifies expense rows via the injected classifier", async () => {
    const { repo, addTxn } = await setup();
    await addTxn(-1990, "A");
    await addTxn(-3200, "B"); // distinct merchants — no reuse in play here
    const result = await drainPending(repo, always("Necessary"), { plan: "Premium" });
    expect(result).toEqual({ classified: 2, failed: 0, capped: 0, reused: 0 });
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
    await drainPending(repo, counting, { plan: "Premium" });
    expect(calls).toBe(0);
    expect((await repo.transactions.findById(credit.id))?.expenseType).toBe("");
  });

  it("does not classify a manually-overridden row — only non-overridden rows hit the model", async () => {
    const { repo, addTxn } = await setup();
    const [overridden] = await addTxn(-1990, "OVERRIDDEN");
    await addTxn(-3200, "NORMAL");
    await repo.overrides.upsert({ transactionId: overridden.id, expenseType: "Nice to have" });
    let calls = 0;
    const counting: Classifier = async () => {
      calls += 1;
      return { expenseType: "Fixed" };
    };
    const result = await drainPending(repo, counting, { plan: "Premium" });
    expect(calls).toBe(1); // only the non-overridden row is classified — no token on the overridden one
    expect(result).toEqual({ classified: 1, failed: 0, capped: 0, reused: 0 });
    // The overridden row stays pending with no AI type baked into `expenseType`, so the override's
    // type isn't frozen as ground-truth — removing the override re-exposes it for real classification.
    const row = await repo.transactions.findById(overridden.id);
    expect(row?.classificationStatus).toBe("pending");
    expect(row?.expenseType).toBeNull();
  });

  it("does not classify an overridden credit either (no model call, stays out of the buckets)", async () => {
    const { repo, addTxn } = await setup();
    const [credit] = await addTxn(5000, "REFUND"); // positive amount = credit
    await repo.overrides.upsert({ transactionId: credit.id, expenseType: "Nice to have" });
    let calls = 0;
    const counting: Classifier = async () => {
      calls += 1;
      return { expenseType: "Fixed" };
    };
    const result = await drainPending(repo, counting, { plan: "Premium" });
    expect(calls).toBe(0);
    expect(result).toEqual({ classified: 0, failed: 0, capped: 0, reused: 0 });
    // `expenseType` stays null (not "" from the credit guard), so removing the override reverts the
    // credit to the credit path (NOT_BUCKETED) rather than freezing it as an expense type.
    expect((await repo.transactions.findById(credit.id))?.expenseType).toBeNull();
  });

  it("applies a matching Merchant rule instead of the model (deterministic, no model call)", async () => {
    const { repo, addTxn } = await setup();
    await repo.merchantRules.create({ merchant: "NETFLIX", flatType: "Fixed" });
    const [ruled] = await addTxn(-1990, "NETFLIX");
    await addTxn(-3200, "OBSCURE SHOP");
    let calls = 0;
    const counting: Classifier = async () => {
      calls += 1;
      return { expenseType: "Necessary", confidence: 0.9 };
    };

    const result = await drainPending(repo, counting, { plan: "Premium" });

    expect(calls).toBe(1); // only the unmatched row hit the model
    expect(result).toEqual({ classified: 2, failed: 0, capped: 0, reused: 0 });
    const row = await repo.transactions.findById(ruled.id);
    expect(row?.expenseType).toBe("Fixed");
    expect(row?.confidence).toBe(1);
    expect(row?.reasoning).toBe("merchant rule");
  });

  it("applies Merchant rules even for a Free household at its cap (rules are not gated)", async () => {
    const { repo, addTxn, accountId, uploadId } = await setup();
    await repo.transactions.createMany(
      Array.from({ length: 50 }, (_, i) => ({
        accountId,
        uploadId,
        date: "2026-01-01",
        amount: -(i + 1),
        merchant: `M${i}`,
        rawCategory: "x",
        sourceRow: i,
        classificationStatus: "classified" as const,
        expenseType: "Fixed" as const,
      })),
    );
    await repo.merchantRules.create({ merchant: "NETFLIX", flatType: "Fixed" });
    const [ruled] = await addTxn(-1990, "NETFLIX");
    await addTxn(-5000, "OVER-CAP");

    let calls = 0;
    const counting: Classifier = async () => {
      calls += 1;
      return { expenseType: "Fixed" };
    };
    const result = await drainPending(repo, counting, { plan: "Free" });

    expect(calls).toBe(0); // model still gated
    expect(result).toEqual({ classified: 1, failed: 0, capped: 1, reused: 0 }); // rule row classified; model row capped
    expect((await repo.transactions.findById(ruled.id))?.expenseType).toBe("Fixed");
  });

  it("marks a row failed when the classifier throws, and continues", async () => {
    const { repo, addTxn } = await setup();
    await addTxn(-100);
    const boom: Classifier = async () => {
      throw new Error("model error");
    };
    const result = await drainPending(repo, boom, { plan: "Premium" });
    expect(result).toEqual({ classified: 0, failed: 1, capped: 0, reused: 0 });
    expect(await repo.transactions.listPending()).toHaveLength(0); // moved to failed
  });

  it("does not log merchant or amount (PII) when a classification fails", async () => {
    const { repo, addTxn } = await setup();
    await addTxn(-4242, "SECRET-MERCHANT");
    const errs: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errs.push(args.map(String).join(" "));
    });
    const boom: Classifier = async () => {
      throw new Error("model error");
    };
    await drainPending(repo, boom, { plan: "Premium" });
    spy.mockRestore();
    const joined = errs.join("\n");
    expect(joined).toContain("[classify] failed"); // still surfaces the failure + txn id
    expect(joined).not.toContain("SECRET-MERCHANT");
    expect(joined).not.toContain("4242");
  });

  it("is resumable — a second drain does nothing once the queue is empty", async () => {
    const { repo, addTxn } = await setup();
    await addTxn(-100);
    await drainPending(repo, always("Fixed"), { plan: "Premium" });
    const second = await drainPending(repo, always("Necessary"), { plan: "Premium" });
    expect(second).toEqual({ classified: 0, failed: 0, capped: 0, reused: 0 });
  });

  it("respects the batch limit", async () => {
    const { repo, addTxn } = await setup();
    await addTxn(-1, "A");
    await addTxn(-2, "B");
    await addTxn(-3, "C"); // distinct merchants so the limit — not reuse — bounds the batch
    const result = await drainPending(repo, always("Fixed"), { plan: "Premium", limit: 2 });
    expect(result.classified).toBe(2);
    expect(await repo.transactions.listPending()).toHaveLength(1);
  });

  it("stops AI-classifying a Free household at its cap, leaving rows pending", async () => {
    const { repo, addTxn, accountId, uploadId } = await setup();
    // Seed 50 already-classified transactions to reach the Free cap.
    await repo.transactions.createMany(
      Array.from({ length: 50 }, (_, i) => ({
        accountId,
        uploadId,
        date: "2026-01-01",
        amount: -(i + 1),
        merchant: `M${i}`,
        rawCategory: "x",
        sourceRow: i,
        classificationStatus: "classified" as const,
        expenseType: "Fixed" as const,
      })),
    );
    await addTxn(-5000, "OVER-CAP");

    let calls = 0;
    const counting: Classifier = async () => {
      calls += 1;
      return { expenseType: "Fixed" };
    };
    const result = await drainPending(repo, counting, { plan: "Free" });

    expect(calls).toBe(0); // model never called once the cap is reached
    expect(result.capped).toBe(1);
    expect(await repo.transactions.listPending()).toHaveLength(1); // left pending for upgrade
  });

  describe("classification reuse (ADR-0012)", () => {
    it("reuses a merchant's fresh type within one run — one model call for N rows", async () => {
      const { repo, addTxn } = await setup();
      const [a] = await addTxn(-1990, "COSTCO");
      const [b] = await addTxn(-2500, "COSTCO");
      const [c] = await addTxn(-3000, "COSTCO 045"); // normalizes to COSTCO — same reuse key
      let calls = 0;
      const counting: Classifier = async () => {
        calls += 1;
        return { expenseType: "Necessary", confidence: 0.9 };
      };

      const result = await drainPending(repo, counting, { plan: "Premium" });

      expect(calls).toBe(1); // one model call, the other two reused
      expect(result).toEqual({ classified: 3, failed: 0, capped: 0, reused: 2 });
      // All three land on the same type; exactly two were reused (which specific row seeded the model
      // call depends on pending order, which ties on created_at — so assert order-agnostically).
      const rows = await Promise.all([a, b, c].map((t) => repo.transactions.findById(t.id)));
      expect(rows.map((r) => r?.expenseType)).toEqual(["Necessary", "Necessary", "Necessary"]);
      const reused = rows.filter((r) => r?.reasoning === REUSED_REASON);
      expect(reused).toHaveLength(2);
      expect(reused.every((r) => r?.confidence === 0.9)).toBe(true); // reuse carries source confidence
    });

    it("reuses a confident type across runs — no model call on the second run", async () => {
      const { repo, addTxn } = await setup();
      await addTxn(-1990, "SPOTIFY");
      let calls = 0;
      const counting: Classifier = async () => {
        calls += 1;
        return { expenseType: "Fixed", confidence: 0.95 };
      };
      await drainPending(repo, counting, { plan: "Premium" });
      expect(calls).toBe(1);

      const [next] = await addTxn(-1990, "SPOTIFY");
      const result = await drainPending(repo, counting, { plan: "Premium" });

      expect(calls).toBe(1); // still one — the second run reused history
      expect(result).toEqual({ classified: 1, failed: 0, capped: 0, reused: 1 });
      expect((await repo.transactions.findById(next.id))?.expenseType).toBe("Fixed");
    });

    it("does not reuse across runs below the confidence floor", async () => {
      const { repo, addTxn } = await setup();
      await addTxn(-500, "WEIRD");
      let calls = 0;
      const counting: Classifier = async () => {
        calls += 1;
        return { expenseType: "Nice to have", confidence: 0.5 }; // below 0.7 floor
      };
      await drainPending(repo, counting, { plan: "Premium" });
      await addTxn(-500, "WEIRD");
      const result = await drainPending(repo, counting, { plan: "Premium" });

      expect(calls).toBe(2); // re-run, not reused — the prior guess wasn't confident enough to seed
      expect(result.reused).toBe(0);
    });

    it("reuses the majority type when confident history disagrees", async () => {
      const { repo, addTxn, accountId, uploadId } = await setup();
      const confident = (expenseType: "Fixed" | "Nice to have", i: number) => ({
        accountId,
        uploadId,
        date: "2026-01-01",
        amount: -9000,
        merchant: "WORLD CLASS",
        rawCategory: "x",
        sourceRow: 100 + i,
        classificationStatus: "classified" as const,
        expenseType,
        confidence: 0.9,
        reasoning: "model",
      });
      await repo.transactions.createMany([
        confident("Fixed", 0),
        confident("Fixed", 1),
        confident("Nice to have", 2),
      ]);
      const [pending] = await addTxn(-1500, "WORLD CLASS");
      let calls = 0;
      const counting: Classifier = async () => {
        calls += 1;
        return { expenseType: "Necessary", confidence: 0.9 };
      };

      const result = await drainPending(repo, counting, { plan: "Premium" });

      expect(calls).toBe(0); // reused, not re-run
      expect(result.reused).toBe(1);
      expect((await repo.transactions.findById(pending.id))?.expenseType).toBe("Fixed"); // majority
    });

    it("runs the model when confident history is exactly tied", async () => {
      const { repo, addTxn, accountId, uploadId } = await setup();
      const confident = (expenseType: "Fixed" | "Nice to have", i: number) => ({
        accountId,
        uploadId,
        date: "2026-01-01",
        amount: -9000,
        merchant: "WORLD CLASS",
        rawCategory: "x",
        sourceRow: 200 + i,
        classificationStatus: "classified" as const,
        expenseType,
        confidence: 0.9,
        reasoning: "model",
      });
      await repo.transactions.createMany([confident("Fixed", 0), confident("Nice to have", 1)]);
      const [pending] = await addTxn(-1500, "WORLD CLASS");
      let calls = 0;
      const counting: Classifier = async () => {
        calls += 1;
        return { expenseType: "Necessary", confidence: 0.9 };
      };

      const result = await drainPending(repo, counting, { plan: "Premium" });

      expect(calls).toBe(1); // tie → the model decides
      expect(result.reused).toBe(0);
      expect((await repo.transactions.findById(pending.id))?.expenseType).toBe("Necessary");
    });

    it("counts reused rows toward the Free cap (a reuse can push a household over)", async () => {
      const { repo, addTxn, accountId, uploadId } = await setup();
      // 48 filler classified + 1 confident GYM classification = 49 toward the cap; GYM seeds reuse.
      await repo.transactions.createMany([
        ...Array.from({ length: 48 }, (_, i) => ({
          accountId,
          uploadId,
          date: "2026-01-01",
          amount: -(i + 1),
          merchant: `M${i}`,
          rawCategory: "x",
          sourceRow: i,
          classificationStatus: "classified" as const,
          expenseType: "Fixed" as const,
        })),
        {
          accountId,
          uploadId,
          date: "2026-01-01",
          amount: -9000,
          merchant: "GYM",
          rawCategory: "x",
          sourceRow: 48,
          classificationStatus: "classified" as const,
          expenseType: "Fixed" as const,
          confidence: 0.9,
          reasoning: "model",
        },
      ]);
      await addTxn(-9000, "GYM");
      await addTxn(-9000, "GYM");

      let calls = 0;
      const counting: Classifier = async () => {
        calls += 1;
        return { expenseType: "Fixed" };
      };
      const result = await drainPending(repo, counting, { plan: "Free" });

      expect(calls).toBe(0); // both handled by reuse, no model
      // First GYM reused (49→50); the second is over the cap and left pending.
      expect(result).toEqual({ classified: 1, failed: 0, capped: 1, reused: 1 });
    });
  });

  describe("Category persistence (ADR-0020)", () => {
    const withCategory =
      (category: string): Classifier =>
      async () => ({
        expenseType: "Necessary",
        confidence: 0.9,
        reasoning: "test",
        category,
        categoryConfidence: 0.8,
      });

    async function rowsFor(householdId: string, merchant: string) {
      // Scope by household: the shared PGlite db accumulates rows across tests.
      return db
        .select()
        .from(transactions)
        .where(and(eq(transactions.householdId, householdId), eq(transactions.merchant, merchant)));
    }

    it("resolves the classified category slug to the household's leaf category_id", async () => {
      const { repo, addTxn, householdId } = await setup();
      await seedCategoriesForHousehold(asDb(db), householdId);
      await addTxn(-4200, "BONUS");
      await drainPending(repo, withCategory("groceries"), { plan: "Premium" });

      const groceriesId = (await repo.categories.leafSlugToId()).get("groceries");
      const [row] = await rowsFor(householdId, "BONUS");
      expect(row.categoryId).toBe(groceriesId);
      expect(row.categoryConfidence).toBeCloseTo(0.8);
    });

    it("forwards the resolved Category to a repeated merchant via within-run reuse", async () => {
      const { repo, addTxn, householdId } = await setup();
      await seedCategoriesForHousehold(asDb(db), householdId);
      await addTxn(-4200, "BONUS");
      await addTxn(-1500, "BONUS"); // second row of same merchant → reuse path

      let calls = 0;
      const once: Classifier = async () => {
        calls += 1;
        return { expenseType: "Necessary", confidence: 0.9, category: "groceries", categoryConfidence: 0.8 };
      };
      const result = await drainPending(repo, once, { plan: "Premium" });

      expect(calls).toBe(1); // one model call; the second BONUS row reused
      expect(result.reused).toBe(1);
      const groceriesId = (await repo.categories.leafSlugToId()).get("groceries");
      const rows = await rowsFor(householdId, "BONUS");
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.categoryId === groceriesId)).toBe(true);
    });

    it("leaves Uncategorized when the model abstains or the slug isn't a household leaf", async () => {
      const { repo, addTxn, householdId } = await setup();
      await seedCategoriesForHousehold(asDb(db), householdId);
      await addTxn(-999, "MYSTERY");
      await drainPending(repo, withCategory("not-a-real-slug"), { plan: "Premium" });

      const [row] = await rowsFor(householdId, "MYSTERY");
      expect(row.categoryId).toBeNull();
      expect(row.categoryConfidence).toBeNull();
      expect(row.expenseType).toBe("Necessary"); // expense type still classified
    });

    it("applies a merchant rule's Category on match, with no model call", async () => {
      const { repo, addTxn, householdId } = await setup();
      await seedCategoriesForHousehold(asDb(db), householdId);
      const groceriesId = (await repo.categories.leafSlugToId()).get("groceries")!;
      await repo.merchantRules.create({
        merchant: "BONUS",
        flatType: "Necessary",
        categoryId: groceriesId,
      });
      await addTxn(-4200, "BONUS");

      let calls = 0;
      const counting: Classifier = async () => {
        calls += 1;
        return { expenseType: "Fixed" };
      };
      await drainPending(repo, counting, { plan: "Premium" });

      expect(calls).toBe(0); // rule short-circuits the model
      const [row] = await rowsFor(householdId, "BONUS");
      expect(row.categoryId).toBe(groceriesId);
      expect(row.categoryConfidence).toBe(1);
      expect(row.expenseType).toBe("Necessary");
    });

    it("does not auto-assign a hidden Category — its slug falls back to Uncategorized", async () => {
      const { repo, addTxn, householdId } = await setup();
      await seedCategoriesForHousehold(asDb(db), householdId);
      // The Household hid "groceries"; the model may still output it, but it must not be assigned.
      await db
        .update(categories)
        .set({ hidden: true })
        .where(and(eq(categories.householdId, householdId), eq(categories.slug, "groceries")));
      await addTxn(-4200, "BONUS");
      await drainPending(repo, withCategory("groceries"), { plan: "Premium" });

      const [row] = await rowsFor(householdId, "BONUS");
      expect(row.categoryId).toBeNull();
    });
  });
});
