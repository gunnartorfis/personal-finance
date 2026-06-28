import { useRef } from "react";
import { TYPES, type RealType, type TxnView } from "../../shared/types.ts";
import { inMonth, includedSpend, type Included } from "../lib/aggregate.ts";
import { fmt, monthLabel } from "../lib/format.ts";
import { sumSources, type Source } from "../lib/income.ts";
import { TYPE_COLOR } from "../lib/ui.ts";

interface Props {
  months: string[];
  txns: TxnView[];
  sources: Source[];
  monthExtra: Record<string, number>;
  fixedExpenses: Source[];
  included: Included;
  setSources: (s: Source[]) => void;
  setExtra: (e: Record<string, number>) => void;
  setFixedExpenses: (s: Source[]) => void;
  setIncluded: (i: Included) => void;
}

/** Reusable name+amount row editor, shared by income sources and fixed expenses. */
function SourceList({ rows, setRows, namePlaceholder }: { rows: Source[]; setRows: (s: Source[]) => void; namePlaceholder: string }) {
  return (
    <>
      {rows.map((s, i) => (
        <div className="srcrow" key={i}>
          <input
            className="name"
            value={s.name}
            placeholder={namePlaceholder}
            onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
          />
          <input
            className="amt"
            type="number"
            value={s.amt || ""}
            placeholder="0"
            onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, amt: parseFloat(e.target.value) || 0 } : r)))}
          />
          <button className="iconbtn" title="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
    </>
  );
}

export function IncomePanel({ months, txns, sources, monthExtra, fixedExpenses, included, setSources, setExtra, setFixedExpenses, setIncluded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const base = sumSources(sources);
  const fixedMonthly = sumSources(fixedExpenses);
  const monthIncome = (m: string) => base + (Number(monthExtra[m]) || 0);
  const totalIncome = months.reduce((s, m) => s + monthIncome(m), 0);
  const totalSpendInc = includedSpend(txns, included);
  const totalFixed = fixedMonthly * months.length;
  const totalNet = totalIncome - totalSpendInc - totalFixed;

  const setExtraFor = (m: string, raw: string) => {
    const next = { ...monthExtra };
    const v = parseFloat(raw);
    if (raw === "" || isNaN(v)) delete next[m];
    else next[m] = v;
    setExtra(next);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ sources, monthExtra, fixedExpenses, included }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "finance-income.json";
    a.click();
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const o = JSON.parse(String(reader.result));
        if (Array.isArray(o.sources)) setSources(o.sources);
        if (Array.isArray(o.fixedExpenses)) setFixedExpenses(o.fixedExpenses);
        setExtra(o.monthExtra ?? (Array.isArray(o.sources) ? {} : o));
        setIncluded({ Fixed: true, Necessary: true, "Nice to have": true, ...(o.included ?? {}) });
      } catch {
        alert("Invalid JSON");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="card mb16">
      <h2>Income, fixed expenses &amp; net profit / loss</h2>

      <div className="subhead">Recurring income — applied to every month</div>
      <SourceList rows={sources} setRows={setSources} namePlaceholder="Source name (e.g. Salary)" />
      <button className="btn" onClick={() => setSources([...sources, { name: "", amt: 0 }])}>+ Add income source</button>
      <div className="srctotal">= <b>{fmt(base)}</b> recurring income / month</div>

      <div className="subhead">Fixed monthly expenses — off-card (rent, loans, …), applied to every month</div>
      <SourceList rows={fixedExpenses} setRows={setFixedExpenses} namePlaceholder="Expense name (e.g. Rent)" />
      <button className="btn" onClick={() => setFixedExpenses([...fixedExpenses, { name: "", amt: 0 }])}>+ Add fixed expense</button>
      <div className="srctotal">= <b>{fmt(fixedMonthly)}</b> fixed expenses / month</div>

      <div className="subhead">Include card spending in net</div>
      <div className="toggles">
        {(TYPES as readonly RealType[]).map((t) => (
          <span key={t} className={`toggle${included[t] ? "" : " off"}`} onClick={() => setIncluded({ ...included, [t]: !included[t] })}>
            <span className="dot" style={{ background: TYPE_COLOR[t] }} />
            {t}
          </span>
        ))}
      </div>

      <div className="subhead">Per-month breakdown — net = income − card spending − fixed expenses</div>
      <table className="inctable">
        <thead>
          <tr>
            <th>Month</th>
            <th className="num">+ One-off</th>
            <th className="num">Income</th>
            <th className="num">Card spending</th>
            <th className="num">Fixed exp.</th>
            <th className="num">Net</th>
            <th className="num">Savings rate</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => {
            const spend = includedSpend(inMonth(txns, m), included);
            const inc = monthIncome(m);
            const net = inc - spend - fixedMonthly;
            return (
              <tr key={m}>
                <td>{monthLabel(m)}</td>
                <td className="num">
                  <input type="number" placeholder="0" value={monthExtra[m] || ""} onChange={(e) => setExtraFor(m, e.target.value)} />
                </td>
                <td className="num">{fmt(inc)}</td>
                <td className="num">{fmt(spend)}</td>
                <td className="num">{fmt(fixedMonthly)}</td>
                <td className={`num net ${net >= 0 ? "pos" : "neg"}`}>{net >= 0 ? "+" : ""}{fmt(net)}</td>
                <td className={`num ${net >= 0 ? "" : "neg"}`}>{inc ? `${Math.round((net / inc) * 100)}%` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700 }}>
            <td>Total</td>
            <td className="num" />
            <td className="num">{fmt(totalIncome)}</td>
            <td className="num">{fmt(totalSpendInc)}</td>
            <td className="num">{fmt(totalFixed)}</td>
            <td className={`num net ${totalNet >= 0 ? "pos" : "neg"}`}>{totalNet >= 0 ? "+" : ""}{fmt(totalNet)}</td>
            <td className="num">{totalIncome ? `${Math.round((totalNet / totalIncome) * 100)}%` : "—"}</td>
          </tr>
        </tfoot>
      </table>

      <div className="toolbar" style={{ marginTop: 14 }}>
        <button className="btn" onClick={exportJson}>Export (JSON)</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Import</button>
        <input ref={fileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        <button
          className="btn"
          onClick={() => {
            if (confirm("Reset income, fixed expenses, one-offs and toggles?")) {
              setSources([{ name: "Salary", amt: 0 }]);
              setExtra({});
              setFixedExpenses([]);
              setIncluded({ Fixed: true, Necessary: true, "Nice to have": true });
            }
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
