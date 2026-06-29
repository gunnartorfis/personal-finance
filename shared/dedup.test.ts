import { describe, expect, it } from "vitest";

import { fingerprint, partitionNewRows, type FingerprintInput } from "./dedup.ts";

const row = (
  date: string,
  amount: number,
  merchant: string,
  category = "Verslun",
): FingerprintInput => ({ date, amount, merchant, category });

describe("fingerprint", () => {
  it("is equal for rows matching on date, amount, merchant and raw category", () => {
    expect(fingerprint(row("2026-03-01", -1990, "NETFLIX"))).toBe(
      fingerprint(row("2026-03-01", -1990, "NETFLIX")),
    );
  });

  it("differs when any of the four fields differs", () => {
    const base = fingerprint(row("2026-03-01", -1990, "NETFLIX", "Afþreying"));
    expect(fingerprint(row("2026-03-02", -1990, "NETFLIX", "Afþreying"))).not.toBe(base);
    expect(fingerprint(row("2026-03-01", -1991, "NETFLIX", "Afþreying"))).not.toBe(base);
    expect(fingerprint(row("2026-03-01", -1990, "SPOTIFY", "Afþreying"))).not.toBe(base);
    expect(fingerprint(row("2026-03-01", -1990, "NETFLIX", "Verslun"))).not.toBe(base);
  });
});

describe("partitionNewRows", () => {
  it("treats every incoming row as fresh when nothing has been imported", () => {
    const incoming = [row("2026-03-01", -1990, "NETFLIX"), row("2026-03-02", -500, "KAFFITAR")];
    const { fresh, duplicates } = partitionNewRows([], incoming);
    expect(fresh).toEqual(incoming);
    expect(duplicates).toEqual([]);
  });

  it("skips rows already imported (overlapping monthly re-export)", () => {
    const existing = [row("2026-03-01", -1990, "NETFLIX")];
    const incoming = [
      row("2026-03-01", -1990, "NETFLIX"), // same as existing → duplicate
      row("2026-03-05", -3200, "BONUS"), // genuinely new
    ];
    const { fresh, duplicates } = partitionNewRows(existing, incoming);
    expect(fresh).toEqual([row("2026-03-05", -3200, "BONUS")]);
    expect(duplicates).toEqual([row("2026-03-01", -1990, "NETFLIX")]);
  });

  it("keeps genuine same-day same-price repeats (occurrence ordinal)", () => {
    // two identical coffees on the same day, nothing imported yet → both survive
    const twoCoffees = [row("2026-03-03", -650, "KAFFITAR"), row("2026-03-03", -650, "KAFFITAR")];
    expect(partitionNewRows([], twoCoffees).fresh).toEqual(twoCoffees);
  });

  it("re-importing a file with a new repeat keeps only the extra occurrence", () => {
    // one coffee already imported; re-export now shows two of the same coffee.
    const existing = [row("2026-03-03", -650, "KAFFITAR")];
    const incoming = [
      row("2026-03-03", -650, "KAFFITAR"), // matches the imported one → duplicate
      row("2026-03-03", -650, "KAFFITAR"), // the second, genuinely-new occurrence → fresh
    ];
    const { fresh, duplicates } = partitionNewRows(existing, incoming);
    expect(fresh).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
  });
});
