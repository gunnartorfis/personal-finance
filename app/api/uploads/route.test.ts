import { beforeEach, describe, expect, it, vi } from "vitest";

const requireHousehold = vi.fn();
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }));

const getDb = vi.fn(() => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => getDb() }));

const ingestUpload = vi.fn();
vi.mock("@/lib/ingestion/upload", () => ({ ingestUpload: (...a: unknown[]) => ingestUpload(...a) }));

// Shared via vi.hoisted so both the mock factory (below) and the test body reference the SAME class
// — required for the route's `err instanceof RowCapExceededError` check to match what a test throws.
const { RowCapExceededError } = vi.hoisted(() => ({ RowCapExceededError: class extends Error {} }));
const parseStatementCsv = vi.fn<() => unknown>(() => [{ sourceRow: 0 }]);
const parseWithMapping = vi.fn(() => [{ sourceRow: 0 }]);
vi.mock("@/lib/ingestion/parse-csv", () => ({
  parseStatementCsv: () => parseStatementCsv(),
  parseWithMapping: () => parseWithMapping(),
  attemptParse: () => ({ header: ["Dagsetning", "Mótaðili", "Tegund", "Upphæð"] }),
  RowCapExceededError,
}));

import { POST } from "./route";

const ACCOUNT = "11111111-1111-1111-1111-111111111111";

// jsdom hangs parsing a real multipart body, so stub `request.formData()` with a ready FormData
// (construction/`get` work fine under jsdom — only streaming a multipart body does not).
const post = (fields: Record<string, string | File>) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return { formData: async () => form } as unknown as Request;
};
const csvFile = (content = "Dagsetning,Mótaðili,Tegund,Upphæð\n01.03.2026,X,Y,-1 kr.") =>
  new File([content], "statement.csv", { type: "text/csv" });

beforeEach(() => {
  requireHousehold.mockReset();
  ingestUpload.mockReset();
  parseStatementCsv.mockClear();
  parseWithMapping.mockClear();
  requireHousehold.mockResolvedValue({ memberId: "m1", householdId: "h1" });
});

describe("POST /api/uploads", () => {
  it("returns 200 (not 409) when the exact file was already imported", async () => {
    ingestUpload.mockResolvedValue({ status: "duplicate", fileHash: "abc" });
    const res = await POST(post({ file: csvFile(), accountId: ACCOUNT }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "duplicate" });
  });

  it("returns 201 with counts on a fresh import", async () => {
    ingestUpload.mockResolvedValue({ status: "created", upload: { id: "u1" }, appended: 2, duplicates: 0 });
    const res = await POST(post({ file: csvFile(), accountId: ACCOUNT }));
    expect(res.status).toBe(201);
  });

  it("returns 404 for an unknown account", async () => {
    ingestUpload.mockResolvedValue({ status: "unknown-account" });
    const res = await POST(post({ file: csvFile(), accountId: ACCOUNT }));
    expect(res.status).toBe(404);
  });

  it("parses with the explicit mapping when a `mapping` field is present", async () => {
    ingestUpload.mockResolvedValue({ status: "created", upload: { id: "u1" }, appended: 1, duplicates: 0 });
    await POST(
      post({
        file: csvFile(),
        accountId: ACCOUNT,
        mapping: JSON.stringify({ date: 0, merchant: 1, category: 2, amount: 3 }),
      }),
    );
    expect(parseWithMapping).toHaveBeenCalledOnce();
    expect(parseStatementCsv).not.toHaveBeenCalled();
  });

  it("auto-detects (parseStatementCsv) when no mapping field is given", async () => {
    ingestUpload.mockResolvedValue({ status: "created", upload: { id: "u1" }, appended: 1, duplicates: 0 });
    await POST(post({ file: csvFile(), accountId: ACCOUNT }));
    expect(parseStatementCsv).toHaveBeenCalledOnce();
    expect(parseWithMapping).not.toHaveBeenCalled();
  });

  it("passes rememberMapping to ingestUpload when an explicit mapping is supplied", async () => {
    ingestUpload.mockResolvedValue({ status: "created", upload: { id: "u1" }, appended: 1, duplicates: 0 });
    const columns = { date: 0, merchant: 1, category: 2, amount: 3 };
    await POST(post({ file: csvFile(), accountId: ACCOUNT, mapping: JSON.stringify(columns) }));
    const passed = ingestUpload.mock.calls[0]?.[2];
    expect(passed.rememberMapping.columns).toEqual(columns);
    expect(typeof passed.rememberMapping.headerSignature).toBe("string");
  });

  it("does not pass rememberMapping on an auto-detected import", async () => {
    ingestUpload.mockResolvedValue({ status: "created", upload: { id: "u1" }, appended: 1, duplicates: 0 });
    await POST(post({ file: csvFile(), accountId: ACCOUNT }));
    expect(ingestUpload.mock.calls[0]?.[2].rememberMapping).toBeUndefined();
  });

  it("returns 422 when the file exceeds the row cap", async () => {
    parseStatementCsv.mockImplementationOnce(() => {
      throw new RowCapExceededError("too many rows: 20001 exceeds the 20000 cap");
    });
    const res = await POST(post({ file: csvFile(), accountId: ACCOUNT }));
    expect(res.status).toBe(422);
    expect(ingestUpload).not.toHaveBeenCalled();
  });

  it("400s an invalid mapping payload before touching the DB", async () => {
    const res = await POST(
      post({ file: csvFile(), accountId: ACCOUNT, mapping: "{ not valid json" }),
    );
    expect(res.status).toBe(400);
    expect(ingestUpload).not.toHaveBeenCalled();
  });
});
