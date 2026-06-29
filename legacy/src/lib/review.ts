import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExpenseType, TxnView } from "../../shared/types.ts";

/** Order the review queue: least-confident (and largest) expenses first. */
export function buildQueue(rows: TxnView[]): TxnView[] {
  return rows
    .filter((t) => t.amount < 0) // expenses only — credits need no type
    .slice()
    .sort((a, b) => {
      const ca = a.confidence;
      const cb = b.confidence;
      if (ca === null && cb === null) return a.amount - b.amount; // biggest expense first
      if (ca === null) return 1; // unknown confidence sinks to the end
      if (cb === null) return -1;
      if (ca !== cb) return ca - cb; // least confident first
      return a.amount - b.amount; // tiebreak: biggest expense first
    });
}

export interface ReviewApi {
  queue: TxnView[];
  idx: number;
  cur: TxnView | undefined;
  total: number;
  reviewedCount: number;
  done: boolean;
  canUndo: boolean;
  isReviewed: (id: number) => boolean;
  assign: (type: ExpenseType) => void;
  confirm: () => void;
  next: () => void;
  prev: () => void;
  goto: (i: number) => void;
  undo: () => void;
}

interface Options {
  rows: TxnView[];
  onOverride: (id: number, type: ExpenseType | null) => void;
  onClose: () => void;
  rootRef: React.RefObject<HTMLElement | null>;
}

/**
 * Drives a keyboard-first review session over a transaction queue.
 * Several variants can mount this at once; the keydown handler no-ops unless
 * its `rootRef` is the currently visible one (i.e. not inside a `[hidden]`
 * ui.sh picker option), so only the on-screen variant responds to keys.
 */
export function useReviewQueue({ rows, onOverride, onClose, rootRef }: Options): ReviewApi {
  const queue = useMemo(() => buildQueue(rows), [rows]);
  const [idx, setIdx] = useState(0);
  const [reviewed, setReviewed] = useState<Set<number>>(() => new Set());
  const undoStack = useRef<{ id: number; prev: ExpenseType | null; idx: number }[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  const clamp = useCallback((i: number) => Math.max(0, Math.min(queue.length - 1, i)), [queue.length]);
  const cur = queue[idx];

  const goto = useCallback((i: number) => setIdx(clamp(i)), [clamp]);
  const next = useCallback(() => setIdx((i) => clamp(i + 1)), [clamp]);
  const prev = useCallback(() => setIdx((i) => clamp(i - 1)), [clamp]);

  const markReviewed = useCallback((id: number) => {
    setReviewed((s) => {
      const n = new Set(s);
      n.add(id);
      return n;
    });
  }, []);

  const assign = useCallback(
    (type: ExpenseType) => {
      if (!cur) return;
      undoStack.current.push({ id: cur.id, prev: cur.override, idx });
      setCanUndo(true);
      // Match the table's logic: picking the AI's own guess clears the override.
      onOverride(cur.id, type === cur.aiType ? null : type);
      markReviewed(cur.id);
      next();
    },
    [cur, idx, onOverride, markReviewed, next],
  );

  const confirm = useCallback(() => {
    if (!cur) return;
    markReviewed(cur.id); // accept the current type as-is, no write needed
    next();
  }, [cur, markReviewed, next]);

  const undo = useCallback(() => {
    const last = undoStack.current.pop();
    setCanUndo(undoStack.current.length > 0);
    if (!last) return;
    onOverride(last.id, last.prev);
    setReviewed((s) => {
      const n = new Set(s);
      n.delete(last.id);
      return n;
    });
    setIdx(clamp(last.idx));
  }, [onOverride, clamp]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (rootRef.current?.closest("[hidden]")) return; // hidden picker variant
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      switch (e.key) {
        case "1": e.preventDefault(); assign("Fixed"); break;
        case "2": e.preventDefault(); assign("Necessary"); break;
        case "3": e.preventDefault(); assign("Nice to have"); break;
        case "0": e.preventDefault(); assign(""); break;
        case " ": e.preventDefault(); confirm(); break;
        case "ArrowRight": case "j": case "J": e.preventDefault(); next(); break;
        case "ArrowLeft": case "k": case "K": e.preventDefault(); prev(); break;
        case "u": case "U": e.preventDefault(); undo(); break;
        case "Escape": e.preventDefault(); onClose(); break;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [rootRef, assign, confirm, next, prev, undo, onClose]);

  return {
    queue,
    idx,
    cur,
    total: queue.length,
    reviewedCount: reviewed.size,
    done: queue.length > 0 && reviewed.size >= queue.length,
    canUndo,
    isReviewed: useCallback((id: number) => reviewed.has(id), [reviewed]),
    assign,
    confirm,
    next,
    prev,
    goto,
    undo,
  };
}
