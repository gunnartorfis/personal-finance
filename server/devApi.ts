import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { DEFAULT_INCOME, type ExpenseType, type IncomeConfig, type Overrides, type Txn, type TxnView } from "../shared/types.ts";

const DATA_DIR = path.resolve(process.cwd(), "data");
const TX_PATH = path.join(DATA_DIR, "transactions.json");
const OV_PATH = path.join(DATA_DIR, "overrides.json");
const INCOME_PATH = path.join(DATA_DIR, "income.json");

function readJson<T>(p: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(p: string, value: unknown): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2));
}

function sendJson(res: ServerResponse, body: unknown, status = 200): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/** Vite dev-server plugin: persists manual type overrides to data/overrides.json. */
export function financeApi(): Plugin {
  return {
    name: "finance-api",
    configureServer(server) {
      server.middlewares.use("/api/transactions", (_req, res) => {
        const txns = readJson<Txn[]>(TX_PATH, []);
        const overrides = readJson<Overrides>(OV_PATH, {});
        const view: TxnView[] = txns.map((t) => {
          const key = String(t.id);
          const override = Object.prototype.hasOwnProperty.call(overrides, key)
            ? overrides[key]
            : null;
          return { ...t, aiType: t.type, override, effectiveType: override ?? t.type };
        });
        sendJson(res, view);
      });

      server.middlewares.use("/api/overrides", async (req, res) => {
        if (req.method === "GET") {
          sendJson(res, readJson<Overrides>(OV_PATH, {}));
          return;
        }
        if (req.method === "POST") {
          try {
            const { id, type } = JSON.parse(await readBody(req)) as {
              id: number;
              type: ExpenseType | null;
            };
            const overrides = readJson<Overrides>(OV_PATH, {});
            if (type === null) delete overrides[String(id)];
            else overrides[String(id)] = type;
            writeJson(OV_PATH, overrides);
            sendJson(res, { ok: true });
          } catch (err) {
            sendJson(res, { ok: false, error: String(err) }, 400);
          }
          return;
        }
        res.statusCode = 405;
        res.end();
      });

      server.middlewares.use("/api/income", async (req, res) => {
        if (req.method === "GET") {
          sendJson(res, readJson<IncomeConfig>(INCOME_PATH, DEFAULT_INCOME));
          return;
        }
        if (req.method === "POST") {
          try {
            const cfg = JSON.parse(await readBody(req)) as IncomeConfig;
            writeJson(INCOME_PATH, cfg);
            sendJson(res, { ok: true });
          } catch (err) {
            sendJson(res, { ok: false, error: String(err) }, 400);
          }
          return;
        }
        res.statusCode = 405;
        res.end();
      });
    },
  };
}
