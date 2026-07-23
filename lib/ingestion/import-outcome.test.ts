import { describe, expect, it } from "vitest";

import { buildAlreadyImported, summarizeWithheld, type StoredForProvenance } from "./import-outcome";
import type { WithheldRow } from "./parse-csv";

const MAPPING = { date: 0, merchant: 1, category: 2, amount: 3 };

const stored = (
  importedAt: string | null,
  fileName: string | null,
  over: Partial<StoredForProvenance> = {},
): StoredForProvenance => ({
  date: "2026-03-01",
  amount: -650,
  merchant: "KAFFITAR",
  category: "Kaffi",
  importedAt,
  fileName,
  ...over,
});

const dup = (sourceRow: number, over = {}) => ({
  sourceRow,
  date: "2026-03-01",
  amount: -650,
  merchant: "KAFFITAR",
  category: "Kaffi",
  ...over,
});

describe("buildAlreadyImported", () => {
  it("attaches the earliest-imported upload's provenance to a duplicate", () => {
    const result = buildAlreadyImported(
      [dup(2)],
      [
        stored("2026-02-10T00:00:00.000Z", "feb.csv"),
        stored("2026-01-05T00:00:00.000Z", "dec.csv"), // earlier — wins
      ],
    );
    expect(result.alreadyImported).toEqual([
      {
        sourceRow: 2,
        date: "2026-03-01",
        amount: -650,
        merchant: "KAFFITAR",
        category: "Kaffi",
        importedAt: "2026-01-05T00:00:00.000Z",
        fileName: "dec.csv",
      },
    ]);
    expect(result.alreadyImportedTotal).toBe(1);
  });

  it("reports null provenance when the matched row has no upload (bank sync)", () => {
    const result = buildAlreadyImported([dup(0)], [stored(null, null)]);
    expect(result.alreadyImported[0]).toMatchObject({ importedAt: null, fileName: null });
  });

  it("caps the list but reports the true total", () => {
    const dups = Array.from({ length: 60 }, (_, i) => dup(i));
    const result = buildAlreadyImported(dups, [stored("2026-01-01T00:00:00.000Z", "a.csv")], 50);
    expect(result.alreadyImported).toHaveLength(50);
    expect(result.alreadyImportedTotal).toBe(60);
  });
});

describe("summarizeWithheld", () => {
  it("maps a correctable row to role-labelled raw values", () => {
    const withheld: WithheldRow[] = [
      { sourceRow: 1, reason: "bad-amount", cells: ["05.03.2026", "BÓNUS", "Verslun", "ódýrt"] },
    ];
    const result = summarizeWithheld(withheld, MAPPING);
    expect(result.couldntRead).toEqual([
      {
        sourceRow: 1,
        reason: "bad-amount",
        date: "05.03.2026",
        merchant: "BÓNUS",
        category: "Verslun",
        amount: "ódýrt",
      },
    ]);
    expect(result.couldntReadTotal).toBe(1);
    expect(result.ignoredCount).toBe(0);
  });

  it("counts non-data rows as ignored and omits them from couldntRead", () => {
    const withheld: WithheldRow[] = [
      { sourceRow: 0, reason: "non-data", cells: ["", "", "", ""] },
      { sourceRow: 1, reason: "bad-date", cells: ["2026-03-01", "M", "C", "-1 kr."] },
    ];
    const result = summarizeWithheld(withheld, MAPPING);
    expect(result.ignoredCount).toBe(1);
    expect(result.couldntRead).toHaveLength(1);
    expect(result.couldntRead[0].reason).toBe("bad-date");
  });

  it("caps couldntRead at the limit but reports the true total", () => {
    const many: WithheldRow[] = Array.from({ length: 60 }, (_, i) => ({
      sourceRow: i,
      reason: "bad-amount",
      cells: ["01.03.2026", "M", "C", "bad"],
    }));
    const result = summarizeWithheld(many, MAPPING, 50);
    expect(result.couldntRead).toHaveLength(50);
    expect(result.couldntReadTotal).toBe(60);
  });

  it("flags a systematic failure when most correctable rows fail the same way", () => {
    const many: WithheldRow[] = Array.from({ length: 30 }, (_, i) => ({
      sourceRow: i,
      reason: "bad-date",
      cells: ["2026-03-01", "M", "C", "-1 kr."],
    }));
    expect(summarizeWithheld(many, MAPPING).systematic).toBe(true);
  });

  it("does not flag a systematic failure for a couple of isolated rows", () => {
    const few: WithheldRow[] = [
      { sourceRow: 0, reason: "bad-amount", cells: ["01.03.2026", "M", "C", "x"] },
    ];
    expect(summarizeWithheld(few, MAPPING).systematic).toBe(false);
  });
});
