import { useEffect, useMemo, useRef, useState } from "react";
import type { ExpenseType, TxnView } from "../shared/types.ts";
import { billingMonth } from "../shared/billing.ts";
import { fetchIncome, fetchTransactions, postOverride, saveIncome } from "./api.ts";
import { inMonth, monthsOf, type Included } from "./lib/aggregate.ts";
import { monthLabel } from "./lib/format.ts";
import { DEFAULT_INCOME, sumSources, type Source } from "./lib/income.ts";
import { Kpis } from "./components/Kpis.tsx";
import { MonthlyChart } from "./components/MonthlyChart.tsx";
import { Donut } from "./components/Donut.tsx";
import { IncomePanel } from "./components/IncomePanel.tsx";
import { AggTable } from "./components/AggTable.tsx";
import { TransactionsTable } from "./components/TransactionsTable.tsx";
import { ReviewMode } from "./components/ReviewMode.tsx";

export default function App() {
  const [txns, setTxns] = useState<TxnView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selMonth, setSelMonth] = useState("all");
  const [reviewOpen, setReviewOpen] = useState(false);

  const [sources, setSources] = useState<Source[]>(DEFAULT_INCOME.sources);
  const [monthExtra, setExtra] = useState<Record<string, number>>(DEFAULT_INCOME.monthExtra);
  const [fixedExpenses, setFixedExpenses] = useState<Source[]>(DEFAULT_INCOME.fixedExpenses);
  const [included, setIncluded] = useState<Included>(DEFAULT_INCOME.included);
  const [incomeLoaded, setIncomeLoaded] = useState(false);

  useEffect(() => {
    // `month` is the billing cycle (27th–26th), derived from each date.
    fetchTransactions()
      .then((rows) => setTxns(rows.map((t) => ({ ...t, month: billingMonth(t.date) }))))
      .catch((e) => setError(String(e)));
    fetchIncome()
      .then((cfg) => {
        setSources(cfg.sources);
        setExtra(cfg.monthExtra ?? {});
        setFixedExpenses(cfg.fixedExpenses ?? []);
        setIncluded({ ...DEFAULT_INCOME.included, ...cfg.included });
      })
      .catch(() => {/* income store unreachable — keep defaults */})
      .finally(() => setIncomeLoaded(true));
  }, []);

  // Persist income + fixed expenses to data/income.json (debounced) once loaded.
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!incomeLoaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveIncome({ sources, monthExtra, fixedExpenses, included }).catch((e) => setError(String(e)));
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [sources, monthExtra, fixedExpenses, included, incomeLoaded]);

  const onOverride = (id: number, type: ExpenseType | null) => {
    setTxns((prev) =>
      prev
        ? prev.map((t) => (t.id === id ? { ...t, override: type, effectiveType: type ?? t.aiType } : t))
        : prev,
    );
    postOverride(id, type).catch((e) => setError(String(e)));
  };

  const months = useMemo(() => (txns ? monthsOf(txns) : []), [txns]);
  const base = sumSources(sources);
  const incomeByMonth = useMemo(() => {
    const o: Record<string, number> = {};
    for (const m of months) o[m] = base + (Number(monthExtra[m]) || 0);
    return o;
  }, [months, base, monthExtra]);

  if (error) return <div className="wrap"><div className="banner">Failed to load data: {error}. Is the dev server running, and has <code>npm run seed</code> or <code>npm run classify</code> produced <code>data/transactions.json</code>?</div></div>;
  if (!txns) return <div className="wrap"><div className="loading">Loading…</div></div>;

  const list = inMonth(txns, selMonth);
  const incTot = selMonth === "all"
    ? months.reduce((s, m) => s + (incomeByMonth[m] ?? 0), 0)
    : incomeByMonth[selMonth] ?? 0;
  // Fixed monthly expenses are constant per billing period (× #months when viewing all).
  const fixedMonthly = sumSources(fixedExpenses);
  const fixedTot = selMonth === "all" ? fixedMonthly * months.length : fixedMonthly;
  const scopeLabel = selMonth === "all" ? "all months" : monthLabel(selMonth);

  const dates = txns.map((t) => t.date).sort();
  const range = dates.length ? `${dates[0]} – ${dates[dates.length - 1]}` : "—";
  const seeded = txns.every((t) => t.confidence === null);

  return (
    <div className="wrap">
      <div className="head">
        <div>
          <h1>Finance Dashboard</h1>
          <div className="sub">{range} · {txns.length} transactions · billing cycle 27th–26th</div>
          <button className="btn" style={{ marginTop: 10 }} onClick={() => setReviewOpen(true)}>⚡ Rapid review</button>
        </div>
        <div className="chips">
          <div className={`chip${selMonth === "all" ? " active" : ""}`} onClick={() => setSelMonth("all")}>All</div>
          {months.map((m) => (
            <div key={m} className={`chip${selMonth === m ? " active" : ""}`} onClick={() => setSelMonth(m)}>{monthLabel(m)}</div>
          ))}
        </div>
      </div>

      {seeded && (
        <div className="banner">
          Showing seeded (rule-based) types — no AI confidence yet. Run <code>npm run classify</code> with your token to get AI types &amp; confidence scores.
        </div>
      )}

      <Kpis list={list} included={included} incTot={incTot} fixedTot={fixedTot} scopeLabel={scopeLabel} />

      <div className="grid cols mb16">
        <MonthlyChart txns={txns} months={months} incomeByMonth={incomeByMonth} included={included} />
        <Donut list={list} />
      </div>

      <IncomePanel
        months={months}
        txns={txns}
        sources={sources}
        monthExtra={monthExtra}
        fixedExpenses={fixedExpenses}
        included={included}
        setSources={setSources}
        setExtra={setExtra}
        setFixedExpenses={setFixedExpenses}
        setIncluded={setIncluded}
      />

      <div className="grid cols mb16">
        <div className="card">
          <h2>Top merchants</h2>
          <div className="scroll"><AggTable list={list} keyFn={(t) => t.merchant} head="Merchant" /></div>
        </div>
        <div className="card">
          <h2>Top categories</h2>
          <div className="scroll"><AggTable list={list} keyFn={(t) => t.category} head="Category" /></div>
        </div>
      </div>

      <TransactionsTable rows={list} onOverride={onOverride} />

      <div className="foot">Edit a transaction's Type to override the AI classification — saved to data/overrides.json.</div>

      {reviewOpen && <ReviewMode rows={list} onOverride={onOverride} onClose={() => setReviewOpen(false)} />}
    </div>
  );
}
