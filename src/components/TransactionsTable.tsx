import { useMemo, useState } from "react";
import { TYPES, type ExpenseType, type TxnView } from "../../shared/types.ts";
import { fmt } from "../lib/format.ts";
import { confClass } from "../lib/ui.ts";

interface Props {
  rows: TxnView[]; // already filtered to the selected month
  onOverride: (id: number, type: ExpenseType | null) => void;
}

type SortKey = "date" | "merchant" | "category" | "amount" | "effectiveType" | "confidence";

export function TransactionsTable({ rows, onOverride }: Props) {
  const [search, setSearch] = useState("");
  const [hideHighConf, setHideHighConf] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: number }>({ key: "date", dir: -1 });

  const view = useMemo(() => {
    let list = rows;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.merchant.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
    }
    if (hideHighConf) {
      // Hide confident AI classifications so the uncertain ones are easy to review.
      list = list.filter((t) => !(t.confidence !== null && t.confidence > 0.9));
    }
    const { key, dir } = sort;
    return [...list].sort((a, b) => {
      const x: number | string = a[key] ?? "";
      const y: number | string = b[key] ?? "";
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, search, hideHighConf, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === "merchant" || key === "category" ? 1 : -1 }));

  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir > 0 ? " ▲" : " ▼") : "");

  return (
    <div className="card">
      <h2>Transactions</h2>
      <div className="toolbar">
        <input className="search" placeholder="Search merchant / category…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="checkbox">
          <input type="checkbox" checked={hideHighConf} onChange={(e) => setHideHighConf(e.target.checked)} />
          Hide confidence &gt; 90%
        </label>
        <span className="sub">{view.length} shown</span>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th onClick={() => toggleSort("date")}>Date{arrow("date")}</th>
              <th onClick={() => toggleSort("merchant")}>Merchant{arrow("merchant")}</th>
              <th onClick={() => toggleSort("category")}>Category{arrow("category")}</th>
              <th className="num" onClick={() => toggleSort("amount")}>Amount{arrow("amount")}</th>
              <th onClick={() => toggleSort("effectiveType")}>Type{arrow("effectiveType")}</th>
              <th onClick={() => toggleSort("confidence")}>Confidence{arrow("confidence")}</th>
            </tr>
          </thead>
          <tbody>
            {view.map((t) => (
              <tr key={t.id}>
                <td>{t.date}</td>
                <td>{t.merchant}</td>
                <td className="sub">{t.category || "—"}</td>
                <td className="num" style={{ color: t.amount < 0 ? "var(--txt)" : "var(--pos)" }}>{fmt(t.amount)}</td>
                <td>
                  <select
                    className={`typesel${t.override !== null ? " overridden" : ""}`}
                    value={t.effectiveType}
                    onChange={(e) => {
                      const v = e.target.value as ExpenseType;
                      onOverride(t.id, v === t.aiType ? null : v);
                    }}
                  >
                    {TYPES.map((ty) => (
                      <option key={ty} value={ty}>{ty}</option>
                    ))}
                    <option value="">—</option>
                  </select>
                </td>
                <td>
                  {t.override !== null ? (
                    <span className="conf manual">manual</span>
                  ) : t.confidence === null ? (
                    <span className="conf na">—</span>
                  ) : (
                    <span className={`conf ${confClass(t.confidence)}`} title={t.reasoning}>
                      {Math.round(t.confidence * 100)}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
