import type { TxnView } from "../../shared/types.ts";
import { isExpense, totalSpend } from "../lib/aggregate.ts";
import { fmt } from "../lib/format.ts";

interface Props {
  list: TxnView[];
  keyFn: (t: TxnView) => string;
  head: string;
}

export function AggTable({ list, keyFn, head }: Props) {
  const m = new Map<string, { sum: number; n: number }>();
  for (const t of list) {
    if (!isExpense(t)) continue;
    const k = keyFn(t) || "(none)";
    const e = m.get(k) ?? { sum: 0, n: 0 };
    e.sum += -t.amount;
    e.n += 1;
    m.set(k, e);
  }
  const rows = [...m.entries()].sort((a, b) => b[1].sum - a[1].sum).slice(0, 15);
  const tot = totalSpend(list);

  return (
    <table>
      <thead>
        <tr>
          <th>{head}</th>
          <th className="num">Spent</th>
          <th className="num">#</th>
          <th className="num">%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td>{k}</td>
            <td className="num">{fmt(v.sum)}</td>
            <td className="num">{v.n}</td>
            <td className="num">{tot ? Math.round((v.sum / tot) * 100) : 0}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
