"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"

/** One selectable statement cycle: its `YYYY-MM` key and a human label. */
export interface PeriodOption {
  key: string
  label: string
}

/**
 * Period navigation for the transactions view: a month dropdown flanked by previous/next steppers.
 * Selection is driven entirely by the `cycle` query param (the server reads it and re-renders), so
 * a period is shareable and survives a refresh. `options` is newest-first; the steppers walk that
 * list (older = further down, newer = further up) and disable at the ends so navigation never lands
 * on a period with no data.
 */
export function PeriodSelector({
  options,
  selected,
}: {
  options: PeriodOption[]
  selected: string
}) {
  const router = useRouter()
  const index = options.findIndex((option) => option.key === selected)
  const older =
    index >= 0 && index < options.length - 1 ? options[index + 1] : null
  const newer = index > 0 ? options[index - 1] : null

  function go(key: string) {
    router.push(`/transactions?cycle=${key}`, { scroll: false })
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Previous period"
        disabled={!older}
        onClick={() => older && go(older.key)}
      >
        <ChevronLeft />
      </Button>

      <div className="relative inline-grid h-7 grid-cols-[1fr_--spacing(7)] items-center rounded-md border border-border">
        <label className="sr-only" htmlFor="cycle">
          Statement period
        </label>
        <select
          id="cycle"
          name="cycle"
          value={selected}
          onChange={(event) => go(event.target.value)}
          className="col-span-full row-start-1 appearance-none bg-transparent py-1 pr-7 pl-2.5 text-sm font-medium outline-none"
        >
          {options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
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

      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Next period"
        disabled={!newer}
        onClick={() => newer && go(newer.key)}
      >
        <ChevronRight />
      </Button>
    </div>
  )
}
