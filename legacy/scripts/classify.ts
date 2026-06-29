import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { parseCsv, type RawRow } from "../shared/parse.ts";
import { RULES_PROMPT } from "../shared/rules.ts";
import { TYPES, type ExpenseType, type Txn } from "../shared/types.ts";

const MODEL = "claude-opus-4-8";
const BATCH = Number(process.env.CLASSIFY_BATCH ?? 40);
// Subscription OAuth tokens have tight Messages-API rate limits — default to
// sequential with a delay. Override with env vars if you have an API key.
const CONCURRENCY = Number(process.env.CLASSIFY_CONCURRENCY ?? 1);
const DELAY_MS = Number(process.env.CLASSIFY_DELAY_MS ?? 1500);
const INPUT = path.resolve(process.argv[2] ?? "combined.csv");
const OUT = path.resolve("data/transactions.json");

const VALID = new Set<ExpenseType>([...TYPES, ""]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  // maxRetries: the SDK honors the `retry-after` header and backs off on 429/5xx.
  if (apiKey) return new Anthropic({ apiKey, maxRetries: 8 });
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!token) {
    console.error(
      "Missing credentials. Generate a token with `claude setup-token` and put it in .env as\n" +
        "  CLAUDE_CODE_OAUTH_TOKEN=...\n(or set ANTHROPIC_API_KEY).",
    );
    process.exit(1);
  }
  return new Anthropic({
    authToken: token,
    defaultHeaders: { "anthropic-beta": "oauth-2025-04-20" },
    maxRetries: 8,
  });
}

const classifyTool: Anthropic.Tool = {
  name: "classify",
  description: "Return the expense type, confidence and a short reason for every transaction id provided.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["results"],
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "type", "confidence", "reasoning"],
          properties: {
            id: { type: "integer" },
            type: { type: "string", enum: [...TYPES, ""] },
            confidence: { type: "number" },
            reasoning: { type: "string" },
          },
        },
      },
    },
  },
};

interface AiResult {
  id: number;
  type: ExpenseType;
  confidence: number;
  reasoning: string;
}

async function classifyBatch(client: Anthropic, rows: RawRow[]): Promise<AiResult[]> {
  const lines = rows
    .map((r) => `${r.id}\t${r.merchant}\t${r.category || "(no category)"}\t${r.amount} ISK`)
    .join("\n");
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: [{ type: "text", text: RULES_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: [classifyTool],
    tool_choice: { type: "tool", name: "classify" },
    messages: [
      {
        role: "user",
        content:
          "Classify these transactions. Columns are: id, merchant, category, amount.\n\n" + lines,
      },
    ],
  });
  const block = resp.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("no tool_use block in response");
  const raw = (block.input as { results?: unknown[] }).results ?? [];
  return raw.map((r) => {
    const o = r as Record<string, unknown>;
    const type = (VALID.has(o.type as ExpenseType) ? o.type : "") as ExpenseType;
    const conf = typeof o.confidence === "number" ? Math.max(0, Math.min(1, o.confidence)) : 0;
    return {
      id: Number(o.id),
      type,
      confidence: conf,
      reasoning: typeof o.reasoning === "string" ? o.reasoning : "",
    };
  });
}

/** Run async tasks with bounded concurrency, preserving order. */
async function pool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/** Load a previous run's output so we can resume (skip already-classified rows). */
function loadExisting(): Map<number, Txn> {
  const m = new Map<number, Txn>();
  if (!fs.existsSync(OUT)) return m;
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, "utf8")) as Txn[];
    for (const t of prev) m.set(t.id, t);
  } catch {
    /* corrupt/partial file — start fresh */
  }
  return m;
}

async function main() {
  const rows = parseCsv(INPUT);
  const expenses = rows.filter((r) => r.amount < 0);
  const credits = rows.filter((r) => r.amount >= 0);
  console.log(`Parsed ${rows.length} rows: ${expenses.length} expenses, ${credits.length} credits.`);

  const existing = loadExisting();
  // byId accumulates everything that's "done": credits (deterministic) + classified expenses.
  // An expense counts as done iff a prior result has a non-null confidence.
  const byId = new Map<number, Txn>();
  for (const r of credits) byId.set(r.id, { ...r, type: "", confidence: null, reasoning: "credit/deposit" });
  for (const r of expenses) {
    const prev = existing.get(r.id);
    if (prev && prev.confidence !== null) {
      byId.set(r.id, { ...r, type: prev.type, confidence: prev.confidence, reasoning: prev.reasoning });
    }
  }

  // Atomic write of every done row, in source order (partial during a resumable run).
  const writeOut = () => {
    const out: Txn[] = [];
    for (const r of rows) {
      const t = byId.get(r.id);
      if (t) out.push(t);
    }
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    const tmp = `${OUT}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(out, null, 2));
    fs.renameSync(tmp, OUT);
  };

  const toClassify = expenses.filter((r) => !byId.has(r.id));
  console.log(`${expenses.length - toClassify.length} expenses already classified (reused), ${toClassify.length} to classify.`);

  if (toClassify.length > 0) {
    const client = makeClient();
    const batches: RawRow[][] = [];
    for (let i = 0; i < toClassify.length; i += BATCH) batches.push(toClassify.slice(i, i + BATCH));
    console.log(`Model ${MODEL} · ${batches.length} batches of ${BATCH} · concurrency ${CONCURRENCY} · ${DELAY_MS}ms gap`);

    let done = 0;
    let failed = 0;
    await pool(batches, CONCURRENCY, async (batch, i) => {
      if (i > 0 && DELAY_MS > 0) await sleep(DELAY_MS);
      try {
        const res = await classifyBatch(client, batch);
        const m = new Map(res.map((x) => [x.id, x] as const));
        for (const row of batch) {
          const ai = m.get(row.id);
          if (ai) byId.set(row.id, { ...row, type: ai.type, confidence: ai.confidence, reasoning: ai.reasoning });
        }
        writeOut(); // persist progress after each batch — crash/rate-limit safe
        done += batch.length;
        process.stdout.write(`\rClassified ${done}/${toClassify.length}…`);
      } catch (err) {
        failed += batch.length;
        console.error(`\nBatch failed (ids ${batch[0]?.id}+): ${err}`);
      }
    });
    process.stdout.write("\n");

    if (failed > 0) {
      console.error(
        `\n${failed} transactions still unclassified — progress saved to ${OUT}.\n` +
          "Just re-run to retry only those. If these are rate limits (429):\n" +
          "  • wait ~1 min, then re-run\n" +
          "  • slow it down:  CLASSIFY_DELAY_MS=5000 pnpm classify\n" +
          "  • or use a metered API key: set ANTHROPIC_API_KEY in .env",
      );
      process.exit(1);
    }
  }

  writeOut();
  const written = [...byId.values()];
  const dist: Record<string, number> = {};
  for (const t of written) dist[t.type || "(blank)"] = (dist[t.type || "(blank)"] ?? 0) + 1;
  console.log("Distribution:", dist);
  const low = written.filter((t) => t.confidence !== null && t.confidence < 0.6);
  console.log(`Low-confidence (<0.6): ${low.length}`);
  for (const t of low.slice(0, 15)) {
    console.log(`  ${t.confidence?.toFixed(2)} ${t.type || "—"} | ${t.merchant} — ${t.reasoning}`);
  }
  console.log(`Wrote ${OUT} (${written.length} rows).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
