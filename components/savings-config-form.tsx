"use client"

import { CircleAlert, CircleCheck, Loader2, Plus, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { type FormEvent, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/**
 * The Savings config form (ADR-0007/0015): the household's recurring Monthly income sources and
 * Off-card fixed costs — now EFFECTIVE-DATED (a source keeps a timeline of dated versions; a raise
 * or rent change is a new version) — plus per-cycle One-off adjustments (a bonus, refund, or
 * one-time bill). Saving replaces the whole config in one atomic PUT.
 *
 * A source's identity is its NAME (versions of one source share a name); on the wire each version is
 * its own row. The floor sentinel `0001-01` is the baseline "from the start" cycle — shown here as an
 * empty month and sent back as the floor.
 */

const FLOOR = "0001-01"

let nextKey = 0
const key = () => (nextKey += 1)

interface VersionRow {
  key: number
  amount: string
  /** `YYYY-MM`, or "" for the baseline (maps to the {@link FLOOR} sentinel). */
  effectiveFrom: string
}

interface SourceRow {
  key: number
  name: string
  /** Oldest first; `versions[0]` is the baseline (may carry an empty month). */
  versions: VersionRow[]
}

interface OneOffRow {
  key: number
  cycleKey: string
  kind: "income" | "cost"
  amount: string
  label: string
}

interface WireOneOff {
  cycleKey: string
  kind: "income" | "cost"
  amount: number
  label?: string | null
}

/** Group flat wire rows (one per version) into per-source timelines, oldest version first. */
function groupSources(
  rows: Array<{ name: string; amount: number; effectiveFrom: string }>,
): SourceRow[] {
  const byName = new Map<string, SourceRow>()
  const order: string[] = []
  for (const row of rows) {
    let source = byName.get(row.name)
    if (!source) {
      source = { key: key(), name: row.name, versions: [] }
      byName.set(row.name, source)
      order.push(row.name)
    }
    source.versions.push({
      key: key(),
      amount: String(row.amount),
      effectiveFrom: row.effectiveFrom === FLOOR ? "" : row.effectiveFrom,
    })
  }
  for (const name of order) {
    byName.get(name)!.versions.sort((a, b) => (a.effectiveFrom || FLOOR).localeCompare(b.effectiveFrom || FLOOR))
  }
  return order.map((name) => byName.get(name)!)
}

/** Flatten per-source timelines back to wire rows; an empty baseline month becomes the floor. */
function sourceVersions(
  sources: SourceRow[],
): Array<{ name: string; amount: number; effectiveFrom: string }> {
  return sources.flatMap((source) =>
    source.versions.map((v) => ({
      name: source.name.trim(),
      amount: Number(v.amount),
      effectiveFrom: v.effectiveFrom === "" ? FLOOR : v.effectiveFrom,
    })),
  )
}

/** One recurring source and its dated versions (income or off-card cost). */
function SourceList({
  kind,
  sources,
  onChange,
}: {
  kind: "income" | "offcard"
  sources: SourceRow[]
  onChange: (sources: SourceRow[]) => void
}) {
  const t = useTranslations("incomeSettings")
  const idPrefix = kind
  const legend = t(kind === "income" ? "incomeLegend" : "offcardLegend")
  const addLabel = t(kind === "income" ? "addIncome" : "addOffcard")

  const patchSource = (index: number, patch: Partial<SourceRow>) =>
    onChange(sources.map((s, i) => (i === index ? { ...s, ...patch } : s)))

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-sm font-medium">{legend}</legend>
      {sources.length === 0 && <p className="text-sm text-muted-foreground">{t("none")}</p>}
      {sources.map((source, si) => (
        <div key={source.key} className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
          <div className="flex items-end gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor={`${idPrefix}-name-${si}`} className="text-xs text-muted-foreground">
                {t("nameLabel")}
              </label>
              <Input
                id={`${idPrefix}-name-${si}`}
                name={`${idPrefix}-name-${si}`}
                value={source.name}
                required
                onChange={(e) => patchSource(si, { name: e.target.value })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("remove", { label: source.name || legend.toLowerCase() })}
              onClick={() => onChange(sources.filter((_, i) => i !== si))}
            >
              <Trash2 />
            </Button>
          </div>

          {source.versions.map((version, vi) => {
            const isBaseline = vi === 0
            const patchVersion = (patch: Partial<VersionRow>) =>
              patchSource(si, {
                versions: source.versions.map((v, i) => (i === vi ? { ...v, ...patch } : v)),
              })
            return (
              <div key={version.key} className="flex items-end gap-3 pl-3">
                <div className="flex w-40 flex-col gap-1.5">
                  <label
                    htmlFor={`${idPrefix}-from-${si}-${vi}`}
                    className="text-xs text-muted-foreground"
                  >
                    {isBaseline ? t("baselineLabel") : t("fromMonth")}
                  </label>
                  {isBaseline ? (
                    <p
                      id={`${idPrefix}-from-${si}-${vi}`}
                      className="flex h-9 items-center text-sm text-muted-foreground"
                    >
                      {t("baselineLabel")}
                    </p>
                  ) : (
                    <Input
                      id={`${idPrefix}-from-${si}-${vi}`}
                      name={`${idPrefix}-from-${si}-${vi}`}
                      type="month"
                      required
                      value={version.effectiveFrom}
                      onChange={(e) => patchVersion({ effectiveFrom: e.target.value })}
                    />
                  )}
                </div>
                <div className="flex w-36 flex-col gap-1.5">
                  <label
                    htmlFor={`${idPrefix}-amount-${si}-${vi}`}
                    className="text-xs text-muted-foreground"
                  >
                    {t("amountLabel")}
                  </label>
                  <Input
                    id={`${idPrefix}-amount-${si}-${vi}`}
                    name={`${idPrefix}-amount-${si}-${vi}`}
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={version.amount}
                    onChange={(e) => patchVersion({ amount: e.target.value })}
                  />
                </div>
                {!isBaseline && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("removeChange")}
                    onClick={() =>
                      patchSource(si, { versions: source.versions.filter((_, i) => i !== vi) })
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            )
          })}

          <div className="pl-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                patchSource(si, {
                  versions: [...source.versions, { key: key(), amount: "", effectiveFrom: "" }],
                })
              }
            >
              <Plus />
              {t("addChange")}
            </Button>
          </div>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([...sources, { key: key(), name: "", versions: [{ key: key(), amount: "", effectiveFrom: "" }] }])
          }
        >
          <Plus />
          {addLabel}
        </Button>
      </div>
    </fieldset>
  )
}

/** The per-cycle One-off adjustments section (ADR-0015). */
function OneOffList({
  rows,
  onChange,
}: {
  rows: OneOffRow[]
  onChange: (rows: OneOffRow[]) => void
}) {
  const t = useTranslations("incomeSettings")
  const patch = (index: number, p: Partial<OneOffRow>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...p } : r)))

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium">{t("oneOffLegend")}</legend>
      <p className="text-sm text-muted-foreground">{t("oneOffDescription")}</p>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">{t("noneOneOff")}</p>}
      {rows.map((row, i) => (
        <div key={row.key} className="flex flex-wrap items-end gap-3">
          <div className="flex w-40 flex-col gap-1.5">
            <label htmlFor={`oneoff-month-${i}`} className="text-xs text-muted-foreground">
              {t("oneOffMonth")}
            </label>
            <Input
              id={`oneoff-month-${i}`}
              name={`oneoff-month-${i}`}
              type="month"
              required
              value={row.cycleKey}
              onChange={(e) => patch(i, { cycleKey: e.target.value })}
            />
          </div>
          <div className="flex w-32 flex-col gap-1.5">
            <label htmlFor={`oneoff-kind-${i}`} className="text-xs text-muted-foreground">
              {t("oneOffKindLabel")}
            </label>
            <div className="inline-grid grid-cols-[1fr_--spacing(8)]">
              <select
                id={`oneoff-kind-${i}`}
                name={`oneoff-kind-${i}`}
                value={row.kind}
                onChange={(e) => patch(i, { kind: e.target.value as OneOffRow["kind"] })}
                className="col-span-full row-start-1 h-9 appearance-none rounded-md border border-input bg-transparent pr-8 pl-3 text-sm shadow-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="income">{t("kindIncome")}</option>
                <option value="cost">{t("kindCost")}</option>
              </select>
              <svg
                viewBox="0 0 8 5"
                width="8"
                height="5"
                fill="none"
                aria-hidden="true"
                className="pointer-events-none col-start-2 row-start-1 place-self-center text-muted-foreground"
              >
                <path d="M.5.5 4 4 7.5.5" stroke="currentColor" />
              </svg>
            </div>
          </div>
          <div className="flex w-36 flex-col gap-1.5">
            <label htmlFor={`oneoff-amount-${i}`} className="text-xs text-muted-foreground">
              {t("oneOffAmount")}
            </label>
            <Input
              id={`oneoff-amount-${i}`}
              name={`oneoff-amount-${i}`}
              type="number"
              min={0}
              step={1}
              required
              value={row.amount}
              onChange={(e) => patch(i, { amount: e.target.value })}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor={`oneoff-label-${i}`} className="text-xs text-muted-foreground">
              {t("oneOffLabelField")}
            </label>
            <Input
              id={`oneoff-label-${i}`}
              name={`oneoff-label-${i}`}
              placeholder={t("oneOffLabelPlaceholder")}
              value={row.label}
              onChange={(e) => patch(i, { label: e.target.value })}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("removeOneOff")}
            onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([...rows, { key: key(), cycleKey: "", kind: "income", amount: "", label: "" }])
          }
        >
          <Plus />
          {t("addOneOff")}
        </Button>
      </div>
    </fieldset>
  )
}

export function SavingsConfigForm({ className }: { className?: string }) {
  const t = useTranslations("incomeSettings")
  const [loading, setLoading] = useState(true)
  const [incomeSources, setIncomeSources] = useState<SourceRow[]>([])
  const [offcardCosts, setOffcardCosts] = useState<SourceRow[]>([])
  const [oneOffs, setOneOffs] = useState<OneOffRow[]>([])
  const [busy, setBusy] = useState(false)
  const [errored, setErrored] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let ignore = false
    async function loadInitial() {
      try {
        const res = await fetch("/api/savings/config")
        if (!res.ok) return
        const config = (await res.json()) as {
          incomeSources: Array<{ name: string; amount: number; effectiveFrom: string }>
          offcardCosts: Array<{ name: string; monthlyAmount: number; effectiveFrom: string }>
          oneOffAdjustments?: Array<WireOneOff>
        }
        if (ignore) return
        setIncomeSources(groupSources(config.incomeSources))
        setOffcardCosts(
          groupSources(
            config.offcardCosts.map((c) => ({
              name: c.name,
              amount: c.monthlyAmount,
              effectiveFrom: c.effectiveFrom,
            })),
          ),
        )
        setOneOffs(
          (config.oneOffAdjustments ?? []).map((o) => ({
            key: key(),
            cycleKey: o.cycleKey,
            kind: o.kind,
            amount: String(o.amount),
            label: o.label ?? "",
          })),
        )
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    void loadInitial()
    return () => {
      ignore = true
    }
  }, [])

  async function saveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setErrored(false)
    setSaved(false)
    try {
      const res = await fetch("/api/savings/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incomeSources: sourceVersions(incomeSources),
          offcardCosts: sourceVersions(offcardCosts).map(({ amount, ...rest }) => ({
            ...rest,
            monthlyAmount: amount,
          })),
          oneOffAdjustments: oneOffs.map((o) => {
            const label = o.label.trim()
            return {
              cycleKey: o.cycleKey,
              kind: o.kind,
              amount: Number(o.amount),
              ...(label === "" ? {} : { label }),
            }
          }),
        }),
      })
      if (!res.ok) {
        setErrored(true)
        return
      }
      setSaved(true)
    } catch {
      setErrored(true)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>
  }

  return (
    <form
      onSubmit={saveConfig}
      aria-label={t("formLabel")}
      className={cn("flex flex-col gap-6 rounded-xl border border-border bg-card p-6", className)}
    >
      <SourceList kind="income" sources={incomeSources} onChange={setIncomeSources} />
      <SourceList kind="offcard" sources={offcardCosts} onChange={setOffcardCosts} />
      <OneOffList rows={oneOffs} onChange={setOneOffs} />

      {errored && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>{t("saveError")}</p>
        </div>
      )}
      {saved && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
          {t("saved")}
        </p>
      )}

      <div>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {t("save")}
        </Button>
      </div>
    </form>
  )
}
