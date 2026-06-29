import { TYPES, type RealType, type TxnView } from "../../shared/types.ts";
import { spendByType } from "../lib/aggregate.ts";
import { fmt } from "../lib/format.ts";
import { TYPE_COLOR } from "../lib/ui.ts";

export function Donut({ list }: { list: TxnView[] }) {
  const st = spendByType(list);
  const tot = st.Fixed + st.Necessary + st["Nice to have"];
  let acc = 0;
  const stops: string[] = [];
  for (const t of TYPES as readonly RealType[]) {
    const a = tot ? (st[t] / tot) * 100 : 0;
    stops.push(`${TYPE_COLOR[t]} ${acc}% ${acc + a}%`);
    acc += a;
  }
  const background = tot ? `conic-gradient(${stops.join(",")})` : "var(--panel2)";

  return (
    <div className="card">
      <h2>Spending by type</h2>
      <div className="donutwrap">
        <div className="donut" style={{ background }}>
          <div className="center">
            <div className="big">{fmt(tot)}</div>
            <div className="small">total spend</div>
          </div>
        </div>
        <div style={{ fontSize: 13 }}>
          {(TYPES as readonly RealType[]).map((t) => (
            <div style={{ margin: "8px 0" }} key={t}>
              <span className="dot" style={{ background: TYPE_COLOR[t] }} />
              {t} — <b>{fmt(st[t])}</b> <span className="sub">({tot ? Math.round((st[t] / tot) * 100) : 0}%)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
