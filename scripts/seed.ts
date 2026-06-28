import fs from "node:fs";
import path from "node:path";
import { parseCsv, readExistingTypes } from "../shared/parse.ts";
import { TYPES, type ExpenseType, type Txn } from "../shared/types.ts";

/**
 * No-token bootstrap: build data/transactions.json from any existing `Type`
 * column in the CSV (the deterministic classify-expenses output). Lets the
 * dashboard render before `npm run classify` is run with a real token.
 * Confidence is null (these are rule-based, not AI, classifications).
 */
const INPUT = path.resolve(process.argv[2] ?? "combined.csv");
const OUT = path.resolve("data/transactions.json");

const VALID = new Set<ExpenseType>([...TYPES, ""]);

const rows = parseCsv(INPUT);
const types = readExistingTypes(INPUT);

const txns: Txn[] = rows.map((r) => {
  const raw = (types.get(r.id) ?? "").trim();
  const type = (VALID.has(raw as ExpenseType) ? raw : "") as ExpenseType;
  return {
    ...r,
    type,
    confidence: null,
    reasoning: r.amount >= 0 ? "credit/deposit" : "seed (deterministic rules)",
  };
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(txns, null, 2));
console.log(`Seeded ${OUT} with ${txns.length} rows (no AI; confidence=null).`);
