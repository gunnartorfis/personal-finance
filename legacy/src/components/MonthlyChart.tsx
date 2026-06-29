import { TYPES, type RealType, type TxnView } from "../../shared/types.ts";
import { inMonth, spendByType, type Included } from "../lib/aggregate.ts";
import { fmt, monthLabel } from "../lib/format.ts";
import { TYPE_CLASS } from "../lib/ui.ts";

interface Props {
  txns: TxnView[];
  months: string[];
  incomeByMonth: Record<string, number>;
  included: Included;
}

const H = 170;

export function MonthlyChart({ txns, months, incomeByMonth, included }: Props) {
  const data = months.map((m) => {
    const st = spendByType(inMonth(txns, m));
    const spend = st.Fixed + st.Necessary + st["Nice to have"];
    const incSpend = (TYPES as readonly RealType[])
      .filter((t) => included[t])
      .reduce((s, t) => s + st[t], 0);
    return { m, st, spend, incSpend, income: incomeByMonth[m] ?? 0 };
  });
  const max = Math.max(1, ...data.map((d) => Math.max(d.spend, d.income)));

  return (
    <div className="card">
      <h2>Income vs Spending by month</h2>
      <div className="bars">
        {data.map((d) => {
          const net = d.income - d.incSpend;
          return (
            <div className="mgroup" key={d.m}>
              <div className="barpair">
                <div className="bar" style={{ height: Math.max(2, (d.spend / max) * H) }} title={`Spending: ${fmt(d.spend)}`}>
                  {(TYPES as readonly RealType[]).map((t) => {
                    const h = (d.st[t] / max) * H;
                    if (h <= 0) return null;
                    return (
                      <div
                        key={t}
                        className={`seg ${TYPE_CLASS[t]}${included[t] ? "" : " faded"}`}
                        style={{ height: h }}
                        title={`${t}: ${fmt(d.st[t])}${included[t] ? "" : " (excluded)"}`}
                      />
                    );
                  })}
                </div>
                <div className="bar income" style={{ height: Math.max(2, (d.income / max) * H) }} title={`Income: ${fmt(d.income)}`} />
              </div>
              <div className="mlabel">{monthLabel(d.m)}</div>
              <div className={`net ${net >= 0 ? "pos" : "neg"}`}>{net >= 0 ? "+" : ""}{fmt(net)}</div>
            </div>
          );
        })}
      </div>
      <div className="legend">
        <span><span className="dot" style={{ background: "var(--fixed)" }} />Fixed</span>
        <span><span className="dot" style={{ background: "var(--nec)" }} />Necessary</span>
        <span><span className="dot" style={{ background: "var(--nice)" }} />Nice to have</span>
        <span><span className="dot" style={{ background: "var(--pos)" }} />Income</span>
      </div>
    </div>
  );
}
