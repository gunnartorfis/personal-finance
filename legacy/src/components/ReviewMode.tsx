import { useRef } from "react";
import type { ExpenseType, TxnView } from "../../shared/types.ts";
import { fmt } from "../lib/format.ts";
import { useReviewQueue, type ReviewApi } from "../lib/review.ts";

interface Props {
  rows: TxnView[];
  onOverride: (id: number, type: ExpenseType | null) => void;
  onClose: () => void;
}

function pillClass(type: ExpenseType): string {
  return type === "Fixed" ? "fixed" : type === "Necessary" ? "nec" : type === "Nice to have" ? "nice" : "none";
}

function TypePill({ type }: { type: ExpenseType }) {
  return <span className={`rv-pill ${pillClass(type)}`}>{type || "—"}</span>;
}

const TYPE_BTNS: { t: ExpenseType; k: string; cls: string }[] = [
  { t: "Fixed", k: "1", cls: "fixed" },
  { t: "Necessary", k: "2", cls: "nec" },
  { t: "Nice to have", k: "3", cls: "nice" },
];

function TypeButtons({ suggested, onPick }: { suggested: ExpenseType; onPick: (t: ExpenseType) => void }) {
  return (
    <div className="rv-types">
      {TYPE_BTNS.map((b) => (
        <button
          key={b.t}
          className={`rv-tbtn ${b.cls}${suggested === b.t ? " suggested" : ""}`}
          onClick={() => onPick(b.t)}
        >
          <span className="k">{b.k}</span>
          <span className="lbl">{b.t}</span>
        </button>
      ))}
    </div>
  );
}

function TopBar({ api, onClose }: { api: ReviewApi; onClose: () => void }) {
  const pct = api.total ? Math.round((api.reviewedCount / api.total) * 100) : 0;
  return (
    <div className="rv-top">
      <strong className="rv-title">Rapid review</strong>
      <div className="rv-progress"><i style={{ width: `${pct}%` }} /></div>
      <span className="rv-count">{api.reviewedCount} / {api.total} reviewed</span>
      <button className="rv-close" onClick={onClose}>Esc ✕</button>
    </div>
  );
}

function Legend() {
  return (
    <div className="rv-legend">
      <span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd>assign</span>
      <span><kbd>Space</kbd>confirm</span>
      <span><kbd>0</kbd>clear</span>
      <span><kbd>J</kbd><kbd>K</kbd>next / prev</span>
      <span><kbd>U</kbd>undo</span>
      <span><kbd>Esc</kbd>close</span>
    </div>
  );
}

function DoneScreen({ api }: { api: ReviewApi }) {
  return (
    <div className="rv-done">
      <div className="big">All caught up 🎉</div>
      <div className="sub">{api.reviewedCount} of {api.total} reviewed</div>
    </div>
  );
}

/**
 * Full-screen, keyboard-first rapid-review surface: one transaction at a time.
 * Keys (handled in useReviewQueue): 1/2/3 assign · 0 clear · Space confirm the
 * current type · J/K (or ←/→) navigate · U undo · Esc close. Every assignment
 * is an optimistic write that auto-advances; the queue is ordered
 * least-confident-first so the transactions that need a human come up first.
 */
export function ReviewMode({ rows, onOverride, onClose }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const api = useReviewQueue({ rows, onOverride, onClose, rootRef });
  const t = api.cur;
  return (
    <div className="rv-overlay" ref={rootRef}>
      <TopBar api={api} onClose={onClose} />
      {api.done || !t ? (
        <DoneScreen api={api} />
      ) : (
        <div className="rv-focus">
          <div className="rv-card">
            <div className="merch">{t.merchant}</div>
            <div className="cat">{t.category || "—"} · {t.date}</div>
            <div className="amt">{fmt(t.amount)}</div>
            <div className="rv-suggestion">
              AI suggests <TypePill type={t.effectiveType} />
              {t.confidence !== null && ` · ${Math.round(t.confidence * 100)}% confident`}
            </div>
            {t.reasoning && <div className="rv-reason">{t.reasoning}</div>}
          </div>
          <TypeButtons suggested={t.effectiveType} onPick={api.assign} />
        </div>
      )}
      <Legend />
    </div>
  );
}
