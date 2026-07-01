"use client"

import { useEffect } from "react"

import type { TransactionRow } from "@/components/transactions-table"
import { Button } from "@/components/ui/button"
import {
  useReviewQueue,
  type OnOverride,
} from "@/lib/transactions/review-queue"
import { cn } from "@/lib/utils"
import { TYPES, type RealType } from "@/shared/types"

/** Per-type display metadata: keyboard digit, pill colour, and selected-button colour. */
const TYPE_META: Record<
  RealType,
  { key: string; pill: string; button: string }
> = {
  Fixed: {
    key: "1",
    pill: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    button:
      "data-[suggested=true]:border-blue-500 data-[suggested=true]:text-blue-600 dark:data-[suggested=true]:text-blue-400",
  },
  Necessary: {
    key: "2",
    pill: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    button:
      "data-[suggested=true]:border-amber-500 data-[suggested=true]:text-amber-600 dark:data-[suggested=true]:text-amber-400",
  },
  "Nice to have": {
    key: "3",
    pill: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    button:
      "data-[suggested=true]:border-violet-500 data-[suggested=true]:text-violet-600 dark:data-[suggested=true]:text-violet-400",
  },
}

function TypePill({ type, className }: { type: RealType; className?: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        TYPE_META[type].pill,
        className
      )}
    >
      {type}
    </span>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
      {children}
    </kbd>
  )
}

/**
 * Keyboard-first rapid-review overlay, ported from the legacy tool. Presents the period's
 * needs-attention expenses one at a time, least-confident-first, so the user can blitz the AI's
 * shakiest guesses. `1`/`2`/`3` set Fixed/Necessary/Nice-to-have (and advance), `0` sets split/none,
 * `Space` accepts the AI's guess as-is, `J`/`K` (or arrows) navigate, `U` undoes, `Esc` closes.
 *
 * Each decision persists through `onOverride` (the table updates its row optimistically) and the
 * queue is a one-time snapshot, so settling a row never reshuffles the cards mid-session.
 */
export function ReviewMode({
  rows,
  currency,
  onOverride,
  onClose,
}: {
  rows: TransactionRow[]
  currency: string
  onOverride: OnOverride
  onClose: () => void
}) {
  const {
    cur,
    total,
    reviewedCount,
    done,
    canUndo,
    assign,
    accept,
    next,
    prev,
    undo,
  } = useReviewQueue(rows, onOverride)

  // Global key handling — the overlay owns the keyboard while open. Ignore keystrokes aimed at a
  // text field, and stop the page underneath from also acting on them.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      )
        return
      // On the completion screen no card is shown, so assign/accept keys would silently re-persist
      // the last transaction — ignore them (navigation, undo and close stay live).
      if (done && ["1", "2", "3", "0", " "].includes(event.key)) {
        event.preventDefault()
        return
      }
      const handlers: Record<string, () => void> = {
        "1": () => assign("Fixed"),
        "2": () => assign("Necessary"),
        "3": () => assign("Nice to have"),
        "0": () => assign(""),
        " ": accept,
        j: next,
        J: next,
        ArrowRight: next,
        k: prev,
        K: prev,
        ArrowLeft: prev,
        u: undo,
        U: undo,
        Escape: onClose,
      }
      const handler = handlers[event.key]
      if (handler) {
        event.preventDefault()
        handler()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [assign, accept, next, prev, undo, onClose, done])

  // Lock body scroll while the overlay is up.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const fmtAmount = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  const fmtDate = (date: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(date))

  const progress = total === 0 ? 1 : reviewedCount / total
  // Also exclude `""` (split/none): it's a valid classified value but has no TYPE_META pill, so
  // treating it as "suggested" would crash TypePill on a `TYPE_META[""]` lookup.
  const isClassified =
    cur?.classificationStatus === "classified" &&
    cur.classifiedType !== null &&
    cur.classifiedType !== ""

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rapid review"
      className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm"
    >
      {/* Top bar: title, progress, count, close */}
      <div className="flex items-center gap-4 border-b border-border px-6 py-4">
        <span className="text-sm font-semibold tracking-tight">
          ⚡ Rapid review
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <span className="text-sm text-muted-foreground tabular-nums">
          {reviewedCount} / {total} reviewed
        </span>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Esc ✕
        </Button>
      </div>

      {/* Focus area */}
      <div className="flex flex-1 items-center justify-center p-6">
        {cur && !done ? (
          <div className="flex w-full max-w-md flex-col gap-6 rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex flex-col gap-1">
              <span className="text-lg font-semibold">{cur.merchant}</span>
              <span className="text-sm text-muted-foreground">
                {fmtDate(cur.date)}
              </span>
              <span className="mt-1 text-2xl font-semibold tabular-nums">
                {fmtAmount(cur.amount)}
              </span>
            </div>

            <div className="flex flex-col gap-1 border-t border-border pt-4">
              {isClassified ? (
                <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  AI suggests <TypePill type={cur.classifiedType as RealType} />
                  {cur.confidence !== null && (
                    <span>· {Math.round(cur.confidence * 100)}% confident</span>
                  )}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {cur.classificationStatus === "failed"
                    ? "Classification failed"
                    : "Awaiting classification"}
                </span>
              )}
              {cur.reasoning && (
                <p className="text-sm text-pretty text-muted-foreground/80 italic">
                  {cur.reasoning}
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  data-suggested={cur.classifiedType === type}
                  onClick={() => assign(type)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border border-border px-2 py-3 text-sm font-medium transition-colors hover:bg-muted",
                    TYPE_META[type].button
                  )}
                >
                  <span className="text-xs text-muted-foreground">
                    {TYPE_META[type].key}
                  </span>
                  {type}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="text-2xl">🎉</span>
            <p className="text-lg font-medium">
              {total === 0 ? "Nothing to review" : "All caught up"}
            </p>
            <p className="text-sm text-muted-foreground">
              {total === 0
                ? "Every expense in this period is already settled."
                : `Reviewed ${reviewedCount} transaction${reviewedCount === 1 ? "" : "s"}.`}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={onClose}
            >
              Done
            </Button>
          </div>
        )}
      </div>

      {/* Keyboard legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-border px-6 py-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Kbd>1</Kbd>
          <Kbd>2</Kbd>
          <Kbd>3</Kbd> type
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>0</Kbd> split/none
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Space</Kbd> accept AI
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd> navigate
        </span>
        <span
          className={cn("flex items-center gap-1.5", !canUndo && "opacity-40")}
        >
          <Kbd>U</Kbd> undo
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Esc</Kbd> close
        </span>
      </div>
    </div>
  )
}
