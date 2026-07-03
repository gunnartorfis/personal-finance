"use client"

import { CircleAlert, CircleCheck, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { type FormEvent, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface SavingsGoal {
  id: string
  target: number
  targetDate: string
  startingSaved: number
  startCycle: string
  currency: string
}

/**
 * The Savings goal form (ADR-0007, Phase J): target amount by a target date, how much is already
 * saved, and the Statement cycle progress starts counting from. One goal per Household — saving
 * again updates it in place.
 */
export function SavingsGoalForm({ className }: { className?: string }) {
  const t = useTranslations("savings.goal")
  const [loading, setLoading] = useState(true)
  const [target, setTarget] = useState("")
  const [targetDate, setTargetDate] = useState("")
  const [startingSaved, setStartingSaved] = useState("")
  const [startCycle, setStartCycle] = useState("")
  const [busy, setBusy] = useState(false)
  const [errored, setErrored] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let ignore = false
    async function loadInitial() {
      try {
        const res = await fetch("/api/savings/goal")
        if (!res.ok) return
        const goal = (await res.json()) as SavingsGoal | null
        if (ignore || !goal) return
        setTarget(String(goal.target))
        setTargetDate(goal.targetDate)
        setStartingSaved(String(goal.startingSaved))
        setStartCycle(goal.startCycle)
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    void loadInitial()
    return () => {
      ignore = true
    }
  }, [])

  async function saveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setErrored(false)
    setSaved(false)
    try {
      const res = await fetch("/api/savings/goal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: Number(target),
          targetDate,
          startingSaved: startingSaved === "" ? 0 : Number(startingSaved),
          startCycle,
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
      onSubmit={saveGoal}
      aria-label={t("regionLabel")}
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-border bg-card p-6",
        className
      )}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="goal-target" className="text-sm font-medium">
            {t("target")}
          </label>
          <Input
            id="goal-target"
            name="target"
            type="number"
            min={1}
            step={1}
            required
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder={t("targetPlaceholder")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="goal-target-date" className="text-sm font-medium">
            {t("targetDate")}
          </label>
          <Input
            id="goal-target-date"
            name="targetDate"
            type="date"
            required
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="goal-starting-saved" className="text-sm font-medium">
            {t("alreadySaved")}
          </label>
          <Input
            id="goal-starting-saved"
            name="startingSaved"
            type="number"
            min={0}
            step={1}
            value={startingSaved}
            onChange={(event) => setStartingSaved(event.target.value)}
            placeholder="0"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="goal-start-cycle" className="text-sm font-medium">
            {t("startCycle")}
          </label>
          <Input
            id="goal-start-cycle"
            name="startCycle"
            type="month"
            required
            value={startCycle}
            onChange={(event) => setStartCycle(event.target.value)}
          />
        </div>
      </div>

      {errored && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>{t("error")}</p>
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
