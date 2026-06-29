import { TYPES, type TxnView } from "../../shared/types.ts";
import { creditsOf, expenseCount, includedSpend, spendByType, totalSpend, type Included } from "../lib/aggregate.ts";
import { fmt } from "../lib/format.ts";

interface Props {
  list: TxnView[];
  included: Included;
  incTot: number;
  fixedTot: number;
  scopeLabel: string;
}

export function Kpis({ list, included, incTot, fixedTot, scopeLabel }: Props) {
  const st = spendByType(list);
  const tot = totalSpend(list);
  const net = incTot - includedSpend(list, included) - fixedTot;
  const pct = (v: number) => (tot ? Math.round((v / tot) * 100) : 0);
  const excl = TYPES.filter((t) => !included[t]);
  const netMeta =
    (incTot ? `${Math.round((net / incTot) * 100)}% saved` : "add income →") +
    (excl.length ? ` · excl. ${excl.map((t) => t.replace(" to have", "")).join(", ")}` : "");

  const cards: { label: string; val: string; meta: string; color?: string }[] = [
    { label: "Total spending", val: fmt(tot), meta: `${expenseCount(list)} card expenses · all types` },
    { label: "Income", val: fmt(incTot), meta: scopeLabel },
    { label: "Fixed bills", val: fmt(fixedTot), meta: "monthly, off-card", color: "var(--credit)" },
    { label: "Net profit / loss", val: fmt(net), meta: netMeta, color: net >= 0 ? "var(--pos)" : "var(--neg)" },
    { label: "Fixed", val: fmt(st.Fixed), meta: `${pct(st.Fixed)}% of card`, color: "var(--fixed)" },
    { label: "Necessary", val: fmt(st.Necessary), meta: `${pct(st.Necessary)}% of spend`, color: "var(--nec)" },
    { label: "Nice to have", val: fmt(st["Nice to have"]), meta: `${pct(st["Nice to have"])}% of spend`, color: "var(--nice)" },
    { label: "Credits / deposits", val: fmt(creditsOf(list)), meta: "not counted as income", color: "var(--credit)" },
  ];

  return (
    <div className="grid kpis">
      {cards.map((c) => (
        <div className="card kpi" key={c.label}>
          <div className="label">{c.label}</div>
          <div className="val" style={{ color: c.color ?? "var(--txt)" }}>{c.val}</div>
          <div className="meta">{c.meta}</div>
        </div>
      ))}
    </div>
  );
}
