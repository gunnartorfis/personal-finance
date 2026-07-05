"use client"

import { useLocale, useTranslations } from "next-intl"
import { useEffect, useEffectEvent } from "react"

import type { TransactionRow } from "@/components/transactions-table"
import { Button } from "@/components/ui/button"
import { currencyFormatter } from "@/lib/format/currency"
import { formatDate } from "@/lib/format/date"
import { defaultLocale, toLocale } from "@/lib/i18n/config"
import { useExpenseTypeLabels } from "@/lib/expense-type-labels"
import {
  useReviewQueue,
  type OnOverride,
} from "@/lib/transactions/review-queue"
import { cn } from "@/lib/utils"
import { TYPES, type RealType } from "@/shared/types"

/** Per-type display metadata: keyboard digit. */
const TYPE_META: Record<RealType, { key: string }> = {
  Fixed: { key: "1" },
  Necessary: { key: "2" },
  "Nice to have": { key: "3" },
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
      {children}
    </kbd>
  )
}

/**
 * Keyboard-first rapid-review overlay, ported from the legacy tool. Presents the review backlog (the
 * whole-household set across every period — still-unclassified expenses plus low-confidence AI
 * guesses; confidently-classified or user-overridden rows are settled and excluded) one at a time,
 * showing the AI's guess and confidence for a classified card. `1`/`2`/`3` set Fixed/Necessary/Nice-to-have
 * (and advance), `0` sets split/none, `J`/`K` (or arrows) navigate, `U` undoes, `Esc` closes.
 *
 * Each decision persists through `onOverride` (the caller writes it and reconciles on close) and the
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
  const t = useTranslations("rapidReview")
  const locale = toLocale(useLocale()) ?? defaultLocale
  const typeLabels = useExpenseTypeLabels()
  const { cur, total, reviewedCount, done, canUndo, assign, next, prev, undo } =
    useReviewQueue(rows, onOverride)

  // Global key handling — the overlay owns the keyboard while open. Ignore keystrokes aimed at a
  // text field, and stop the page underneath from also acting on them. The handler reads live
  // callbacks/state via an Effect Event so the listener subscribes once and never re-binds.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null
    if (
      target &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
    )
      return
    // On the completion screen no card is shown, so assign keys would silently re-persist
    // the last transaction — ignore them (navigation, undo and close stay live).
    if (done && ["1", "2", "3", "0"].includes(event.key)) {
      event.preventDefault()
      return
    }
    const handlers: Record<string, () => void> = {
      "1": () => assign("Fixed"),
      "2": () => assign("Necessary"),
      "3": () => assign("Nice to have"),
      "0": () => assign(""),
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
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event)
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])

  // Lock body scroll while the overlay is up.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const money = currencyFormatter(currency, locale)
  const fmtAmount = (amount: number) => money.format(amount)
  const fmtDate = (date: string) =>
    formatDate(new Date(date), locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })

  const progress = total === 0 ? 1 : reviewedCount / total

  return (
    // react-doctor-disable-next-line react-doctor/prefer-html-dialog, react-doctor/prefer-tag-over-role -- a native <dialog>/showModal() would duplicate the overlay's own Escape handling, manual body-scroll lock, and backdrop styling, risking focus/keyboard regressions; keeping the custom dialog
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("dialogLabel")}
      className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm"
    >
      {/* Top bar: title, progress, count, close */}
      <div className="flex items-center gap-4 border-b border-border px-6 py-4">
        <span className="text-sm font-semibold tracking-tight">
          {t("heading")}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("progress", { reviewed: reviewedCount, total })}
        </span>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t("close")}
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
              <span className="text-sm text-muted-foreground">
                {/* A classified card is only ever a low-confidence one here (the queue filters out
                    confident rows), and the filter guarantees a non-null type and confidence — guard
                    on both rather than papering over a null with a fallback, so a malformed row falls
                    through to the neutral status instead of showing a fabricated "0% confident" guess. */}
                {cur.classificationStatus === "classified" &&
                cur.classifiedType !== null &&
                cur.confidence !== null
                  ? t("statusLowConfidence", {
                      type: typeLabels[cur.classifiedType],
                      confidence: Math.round(cur.confidence * 100),
                    })
                  : cur.classificationStatus === "failed"
                    ? t("statusFailed")
                    : t("statusAwaiting")}
              </span>
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
                  onClick={() => assign(type)}
                  className="flex flex-col items-center gap-1 rounded-lg border border-border px-2 py-3 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <span className="text-xs text-muted-foreground">
                    {TYPE_META[type].key}
                  </span>
                  {typeLabels[type]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="text-2xl">🎉</span>
            <p className="text-lg font-medium">
              {total === 0 ? t("doneNothing") : t("doneAllCaughtUp")}
            </p>
            <p className="text-sm text-muted-foreground">
              {total === 0
                ? t("doneBodyEmpty")
                : t("doneBody", { count: reviewedCount })}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={onClose}
            >
              {t("done")}
            </Button>
          </div>
        )}
      </div>

      {/* Keyboard legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-border px-6 py-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Kbd>1</Kbd>
          <Kbd>2</Kbd>
          <Kbd>3</Kbd> {t("legend.type")}
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>0</Kbd> {t("legend.splitNone")}
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd> {t("legend.navigate")}
        </span>
        <span
          className={cn("flex items-center gap-1.5", !canUndo && "opacity-40")}
        >
          <Kbd>U</Kbd> {t("legend.undo")}
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Esc</Kbd> {t("legend.close")}
        </span>
      </div>
    </div>
  )
}
