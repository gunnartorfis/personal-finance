"use client"

import { CircleAlert, Eye, EyeOff, Loader2, Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { type FormEvent, useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCategoryLabel } from "@/lib/categories/label"
import { cn } from "@/lib/utils"
import { TYPES, type RealType } from "@/shared/types"

/** A Category row as returned by `GET /api/categories` (groups + leaves, incl. hidden). */
interface Category {
  id: string
  parentId: string | null
  labelKey: string | null
  label: string | null
  hidden: boolean
}

/** A failed mutation, kept as a translation key so the alert re-translates on a locale change. */
type ManagerError = { key: "add" | "hide" } | { message: string }

async function fetchCategories(): Promise<Category[]> {
  const res = await fetch("/api/categories")
  if (!res.ok) throw new Error("could not load categories")
  return (await res.json()) as Category[]
}

/**
 * Manage the current Household's Category taxonomy (ADR-0020, S6): list the seed + custom tree
 * (groups → leaf Subcategories), hide/unhide a leaf (a soft, reversible prune), and add a custom
 * leaf under a group. Each mutation refetches so the list mirrors server state. Groups can't be
 * hidden (their leaves would stay classifiable), so only leaves carry a hide toggle.
 */
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent concerns (list-load, add-form inputs, add/hide mutations), not one cohesive state machine
export function CategoriesManager({ className }: { className?: string }) {
  const t = useTranslations("categoriesManager")
  const categoryLabel = useCategoryLabel()
  const [rows, setRows] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [parentId, setParentId] = useState("")
  const [label, setLabel] = useState("")
  const [defaultExpenseType, setDefaultExpenseType] = useState<RealType | "">("")
  const [error, setError] = useState<ManagerError | null>(null)
  const [adding, setAdding] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const busy = adding || togglingId !== null

  // Group the leaves under their parent group, both in server (sortOrder) order, for the tree view.
  const groups = useMemo(() => {
    const tops = rows.filter((r) => r.parentId === null)
    return tops.map((group) => ({
      group,
      leaves: rows.filter((r) => r.parentId === group.id),
    }))
  }, [rows])

  async function refresh() {
    try {
      setRows(await fetchCategories())
    } catch {
      // Keep the current list on a transient read failure.
    }
  }

  useEffect(() => {
    let ignore = false
    async function loadInitial() {
      try {
        const data = await fetchCategories()
        if (!ignore) setRows(data)
      } catch {
        // Leave the list empty; the empty state renders.
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    void loadInitial()
    return () => {
      ignore = true
    }
  }, [])

  async function addCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // A whitespace-only label passes the browser's `required` check but the server rejects it with
    // an (English) message; catch it client-side and show the translated error instead.
    const trimmed = label.trim()
    if (trimmed === "") {
      setError({ key: "add" })
      return
    }
    setAdding(true)
    setError(null)
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId,
          label: trimmed,
          // Only send a fallback Expense type when one is chosen.
          ...(defaultExpenseType ? { defaultExpenseType } : {}),
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ? { message: data.error } : { key: "add" })
        return
      }
      setLabel("")
      setDefaultExpenseType("")
      await refresh()
    } catch {
      // A network-level failure (offline / DNS) never reaches the ok-check above.
      setError({ key: "add" })
    } finally {
      setAdding(false)
    }
  }

  async function toggleHidden(category: Category) {
    setTogglingId(category.id)
    setError(null)
    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: !category.hidden }),
      })
      if (res.ok) await refresh()
      else setError({ key: "hide" })
    } catch {
      // Surface network-level failures too, so the spinner never clears without feedback.
      setError({ key: "hide" })
    } finally {
      setTogglingId(null)
    }
  }

  const errorText = (err: ManagerError) =>
    "message" in err ? err.message : err.key === "add" ? t("addError") : t("hideError")

  return (
    <section aria-label={t("regionLabel")} className={cn("flex flex-col gap-6", className)}>
      <form
        onSubmit={addCustom}
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 sm:flex-row sm:items-end"
      >
        <div className="flex flex-col gap-1.5 sm:w-44">
          <label htmlFor="cat-parent" className="text-sm font-medium">
            {t("groupLabel")}
          </label>
          <select
            id="cat-parent"
            name="parentId"
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
            required
            className="h-9 rounded-md border border-input bg-input/20 px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
          >
            <option value="" disabled>
              {t("groupPlaceholder")}
            </option>
            {groups.map(({ group }) => (
              <option key={group.id} value={group.id}>
                {categoryLabel(group)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="cat-label" className="text-sm font-medium">
            {t("nameLabel")}
          </label>
          <Input
            id="cat-label"
            name="label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            required
            maxLength={60}
            placeholder={t("namePlaceholder")}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-44">
          <label htmlFor="cat-type" className="text-sm font-medium">
            {t("defaultTypeLabel")}
          </label>
          <select
            id="cat-type"
            name="defaultExpenseType"
            value={defaultExpenseType}
            onChange={(event) => setDefaultExpenseType(event.target.value as RealType | "")}
            className="h-9 rounded-md border border-input bg-input/20 px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
          >
            <option value="">{t("defaultTypeNone")}</option>
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`types.${type === "Fixed" ? "fixed" : type === "Necessary" ? "necessary" : "niceToHave"}`)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={busy || parentId === ""}>
          {adding ? <Loader2 className="animate-spin" /> : <Plus />}
          {t("add")}
        </Button>
      </form>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>{errorText(error)}</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {groups.map(({ group, leaves }) => (
            <li key={group.id} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{categoryLabel(group)}</h3>
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
                {leaves.map((leaf) => (
                  <li
                    key={leaf.id}
                    className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm"
                  >
                    <span className={cn("truncate", leaf.hidden && "text-muted-foreground line-through")}>
                      {categoryLabel(leaf)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={
                        leaf.hidden
                          ? t("showAria", { name: categoryLabel(leaf) })
                          : t("hideAria", { name: categoryLabel(leaf) })
                      }
                      onClick={() => void toggleHidden(leaf)}
                      disabled={busy}
                    >
                      {togglingId === leaf.id ? (
                        <Loader2 className="animate-spin" />
                      ) : leaf.hidden ? (
                        <Eye />
                      ) : (
                        <EyeOff />
                      )}
                      {leaf.hidden ? t("show") : t("hide")}
                    </Button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
