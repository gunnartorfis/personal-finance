import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { householdRepo } from "@/lib/db/household-repo";
import { households } from "@/lib/db/schema";

import type { ParsedRow } from "./parse-csv";
import { ingestUpload } from "./upload";

// Slice 4: an import links inter-account transfers automatically, and because detection scans the
// full unlinked set it pairs a freshly-imported leg with one imported earlier for the other account.
describe("ingestUpload links inter-account transfers", () => {
  let db: ReturnType<typeof drizzle>;
  const asDb = (d: typeof db) => d as unknown as Parameters<typeof ingestUpload>[0];
  const repoDb = (d: typeof db) => d as unknown as Parameters<typeof householdRepo>[0];
  const bytes = (s: string) => new TextEncoder().encode(s);
  const row = (sourceRow: number, amount: number, merchant: string, date = "2026-03-10"): ParsedRow => ({
    sourceRow,
    date,
    amount,
    merchant,
    rawCategory: "",
  });

  beforeAll(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  async function setup() {
    const [hh] = await db.insert(households).values({}).returning();
    const repo = householdRepo(repoDb(db), hh.id);
    const [bank] = await repo.accounts.create({ name: "Bank" });
    const [card] = await repo.accounts.create({ name: "Card" });
    return { householdId: hh.id, bank: bank.id, card: card.id, repo };
  }

  const groupByMerchant = async (repo: Awaited<ReturnType<typeof setup>>["repo"]) => {
    const rows = await repo.transactions.list();
    return Object.fromEntries(rows.map((r) => [r.merchant, r.transferGroupId]));
  };

  it("pairs a card-bill payment across two separate imports", async () => {
    const { householdId, bank, card, repo } = await setup();

    // First import (bank): the -50k payment has no counterpart yet, so it stays unlinked.
    await ingestUpload(asDb(db), householdId, {
      accountId: bank,
      fileName: "bank.csv",
      bytes: bytes("bank"),
      rows: [row(0, -50_000, "CARD PAYMENT"), row(1, -1_500, "COFFEE")],
    });
    expect((await groupByMerchant(repo))["CARD PAYMENT"]).toBeNull();

    // Second import (card): the +50k credit lands; detection now links it to the bank payment.
    await ingestUpload(asDb(db), householdId, {
      accountId: card,
      fileName: "card.csv",
      bytes: bytes("card"),
      rows: [row(0, 50_000, "PAYMENT RECEIVED", "2026-03-11"), row(1, -8_000, "SHOP")],
    });

    const groups = await groupByMerchant(repo);
    expect(groups["CARD PAYMENT"]).toBeTruthy();
    expect(groups["PAYMENT RECEIVED"]).toBe(groups["CARD PAYMENT"]);
    // Unrelated debits stay unlinked.
    expect(groups["COFFEE"]).toBeNull();
    expect(groups["SHOP"]).toBeNull();
  });
});
