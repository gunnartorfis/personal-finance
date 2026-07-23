import { describe, expect, it } from "vitest";

import { summarizeWithheld } from "./import-outcome";
import type { WithheldRow } from "./parse-csv";

const MAPPING = { date: 0, merchant: 1, category: 2, amount: 3 };

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
