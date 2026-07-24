"use client"

import { ChevronDown, ChevronsUpDown, ChevronUp, RotateCcw, Search, Undo2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useId, useMemo, useState } from "react"

import { RowTypeControl } from "@/components/row-type-control"
import { Button } from "@/components/ui/button"
import { useCategoryLabel } from "@/lib/categories/label"
import { currencyFormatter } from "@/lib/format/currency"
import { formatDate } from "@/lib/format/date"
import { defaultLocale, toLocale } from "@/lib/i18n/config"
import { restoreTransaction } from "@/lib/transactions/delete-client"
import { cn } from "@/lib/utils"
import type { ExpenseType } from "@/shared/types"

/** A row's effective bucket for filtering: excluded, an expense type, an unreviewed debit, or a credit. */
type TypeBucket = ExpenseType | "unclassified" | "credit" | "excluded"
/** The type dropdown's value: any bucket, "all" for no type filter, or "deleted" for the soft-deleted view. */
type TypeFilter = TypeBucket | "all" | "deleted"

/** Column the table is sorted by. Type isn't sortable — it holds the inline controls. */
type SortKey = "date" | "merchant" | "amount"
type SortDir = "asc" | "desc"

/** Filter options in display order; labels are localized in the component via `filter.*` keys. */
const TYPE_FILTER_VALUES: TypeFilter[] = [
  "all",
  "Fixed",
  "Necessary",
  "Nice to have",
  "",
  "unclassified",
  "credit",
  "excluded",
]

/** A row's effective Category id — the manual override wins over the classified/rule one (ADR-0020). */
function effectiveCategoryId(row: TransactionRow): string | null {
  return row.overrideCategoryId ?? row.categoryId
}

/** The bucket a row falls in, mirroring the display logic (excluded wins; credit → income; unreviewed debit → its status). */
function bucketOf(row: TransactionRow): TypeBucket {
  // Excluded rows count for nothing, so they leave every type-specific bucket (ADR-0011).
  if (row.excluded) return "excluded"
  if (row.amount > 0) return "credit"
  const unclassified =
    row.classificationStatus !== "classified" && row.overrideType === null
  if (unclassified) return "unclassified"
  return row.overrideType ?? row.classifiedType ?? ""
}

/**
 * Filter a cycle's rows by the search needle and the type/category filter, then sort by the chosen
 * column (date falls back to id for a stable within-day order). Pure so the table's `visible` memo
 * stays a one-liner.
 */
function filterAndSortRows(
  rows: TransactionRow[],
  query: string,
  typeFilter: TypeFilter,
  categoryFilter: string | null,
  sortKey: SortKey,
  sortDir: SortDir
): TransactionRow[] {
  const needle = query.trim().toLowerCase()
  const filtered = rows.filter((row) => {
    if (typeFilter !== "all" && bucketOf(row) !== typeFilter) return false
    if (categoryFilter !== null) {
      const catId = effectiveCategoryId(row)
      // `none` keeps only Uncategorized rows; otherwise keep rows whose effective Category matches.
      if (categoryFilter === "none" ? catId !== null : catId !== categoryFilter) return false
    }
    if (needle && !row.merchant.toLowerCase().includes(needle)) return false
    return true
  })
  const dir = sortDir === "asc" ? 1 : -1
  return filtered.toSorted((a, b) => {
    const cmp =
      sortKey === "merchant"
        ? a.merchant.localeCompare(b.merchant)
        : sortKey === "amount"
          ? a.amount - b.amount
          : a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
    return cmp * dir
  })
}

/**
 * Build the Category filter's options from a cycle's rows: "All", each Category present (plus the
 * active filter even with no rows here — a dashboard deep-link), then "Uncategorized" when any row
 * lacks one. Sorted by label. Pure so the table's memo stays a one-liner.
 */
function buildCategoryOptions(
  rows: TransactionRow[],
  categoryFilter: string | null,
  categoryParts: Map<string, CategoryOption>,
  labelOf: (parts: CategoryOption) => string,
  allLabel: string,
  uncategorizedLabel: string
): { value: string; label: string }[] {
  const ids = new Set<string>()
  let hasUncategorized = false
  for (const row of rows) {
    const id = effectiveCategoryId(row)
    if (id === null) hasUncategorized = true
    else ids.add(id)
  }
  if (categoryFilter && categoryFilter !== "none") ids.add(categoryFilter)
  const named = [...ids]
    .map((id) => {
      const parts = categoryParts.get(id)
      return { value: id, label: parts ? labelOf(parts) : id }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
  const opts = [{ value: "all", label: allLabel }, ...named]
  if (hasUncategorized || categoryFilter === "none") {
    opts.push({ value: "none", label: uncategorizedLabel })
  }
  return opts
}

/** One transaction row: display fields plus the classified type, AI signals, and any manual override. */
export interface TransactionRow {
  id: string
  date: string
  merchant: string
  amount: number
  /**
   * The Household's Own share of a Shared expense (ADR-0014): the negative portion of this debit it
   * actually bears, `amount <= ownShareAmount < 0`. Null on an ordinary Transaction. The row always
   * displays the full `amount`; this only annotates it and drives what counts as spend.
   */
  ownShareAmount: number | null
  /** Manually marked as real income (credits only, ADR-0009); unmarked credits count for nothing. */
  incomeMarked: boolean
  /** Manually excluded from every calculation (ADR-0011); any sign. */
  excluded: boolean
  /** Optional reason shown on an excluded row; null otherwise. */
  exclusionNote: string | null
  classifiedType: ExpenseType | null
  /** AI confidence 0..1; null for credits and not-yet-classified (pending/failed) rows. */
  confidence: number | null
  /** AI's free-text rationale, shown in rapid review; null/empty when there's none. */
  reasoning: string | null
  overrideType: ExpenseType | null
  classificationStatus: "pending" | "classified" | "failed"
  /** Classified/rule-assigned Category leaf id (ADR-0020); null when Uncategorized. */
  categoryId: string | null
  /** Manually overridden Category leaf id (ADR-0020); wins over {@link categoryId} when set. */
  overrideCategoryId: string | null
  /**
   * Ingestion provenance (ADR-0026): a CSV upload, a bank sync, or a hand-entered `manual` row.
   * Gates the per-row Delete action — a `bank_sync` row is not deletable (a re-Sync re-adds it).
   * Optional because the rapid-review row shape omits it (that path never offers Delete).
   */
  source?: "csv" | "bank_sync" | "manual"
}

/** Stable empty default so an omitted `categories` prop doesn't allocate a new array each render. */
const NO_CATEGORIES: CategoryOption[] = []

/** Stable empty default for the optional `initialDeleted` prop (same rationale as {@link NO_CATEGORIES}). */
const NO_ROWS: TransactionRow[] = []

/** A Household Category leaf's identity + label parts, for resolving a row's effective Category. */
export interface CategoryOption {
  id: string
  /** i18n key (namespace `categories`) for a seed row; null on a custom row. */
  labelKey: string | null
  /** Literal label for a custom row; null on a seed row. */
  label: string | null
}

/** The empty-period state: no rows this cycle, explaining why and pointing to the next action. */
function EmptyPeriod({
  backlogElsewhere,
  className,
}: {
  backlogElsewhere: number
  className?: string
}) {
  const t = useTranslations("transactions")
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-6 py-12 text-center",
        className
      )}
    >
      <p className="text-sm font-medium">{t("empty")}</p>
      <p className="text-sm text-pretty text-muted-foreground">
        {backlogElsewhere > 0
          ? t("emptyBacklog", { count: backlogElsewhere })
          : t.rich("emptyCta", {
              link: (chunks) => (
                <Link
                  href="/upload"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {chunks}
                </Link>
              ),
            })}
      </p>
    </div>
  )
}

/** Search box + type/category filter selects controlling which rows the table shows. */
function TableToolbar({
  query,
  onQueryChange,
  typeFilter,
  onTypeFilterChange,
  deletedCount,
  categoryOptions,
  categoryValue,
  onCategoryChange,
}: {
  query: string
  onQueryChange: (value: string) => void
  typeFilter: TypeFilter
  onTypeFilterChange: (value: TypeFilter) => void
  /** Count of soft-deleted rows this cycle; when >0 the type filter offers a "Deleted" view (ADR-0026). */
  deletedCount: number
  /** Category filter options (`all` / leaf ids / `none`); the select is hidden when only `all`. */
  categoryOptions: { value: string; label: string }[]
  categoryValue: string
  onCategoryChange: (value: string) => void
}) {
  const t = useTranslations("transactions")

  // Filter labels resolved with literal keys, indexed by the filter value.
  const filterLabels: Record<TypeFilter, string> = {
    all: t("filter.all"),
    Fixed: t("filter.fixed"),
    Necessary: t("filter.necessary"),
    "Nice to have": t("filter.niceToHave"),
    "": t("filter.splitNone"),
    unclassified: t("filter.unclassified"),
    credit: t("filter.credits"),
    excluded: t("filter.excluded"),
    deleted: t("filter.deleted", { count: deletedCount }),
  }

  // Offer the "Deleted" view only when there are soft-deleted rows to see (ADR-0026).
  const typeOptions: TypeFilter[] =
    deletedCount > 0 ? [...TYPE_FILTER_VALUES, "deleted"] : TYPE_FILTER_VALUES

  // Unique per instance so IDs / label associations don't collide if two tables ever mount together.
  const searchId = useId()
  const typeFilterId = useId()
  const categoryFilterId = useId()

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative sm:max-w-xs sm:flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <label className="sr-only" htmlFor={searchId}>
          {t("searchLabel")}
        </label>
        <input
          id={searchId}
          name="txn-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-8 w-full min-w-0 rounded-md border border-input bg-input/20 pr-2 pl-7 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 max-sm:text-base/relaxed md:text-sm dark:bg-input/30"
        />
      </div>

      <div className="flex items-center gap-2">
        {/* Category filter — hidden when there's nothing to filter (only the "All" option). */}
        {categoryOptions.length > 1 && (
          <div className="relative inline-grid h-8 grid-cols-[1fr_1.75rem] items-center rounded-md border border-border">
            <label className="sr-only" htmlFor={categoryFilterId}>
              {t("categoryFilterLabel")}
            </label>
            <select
              id={categoryFilterId}
              name="txn-category-filter"
              value={categoryValue}
              onChange={(event) => onCategoryChange(event.target.value)}
              className="col-span-full row-start-1 appearance-none bg-transparent py-1 pr-7 pl-2.5 text-sm font-medium outline-none"
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
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
        )}

        <div className="relative inline-grid h-8 grid-cols-[1fr_1.75rem] items-center rounded-md border border-border">
          <label className="sr-only" htmlFor={typeFilterId}>
            {t("filterLabel")}
          </label>
          <select
            id={typeFilterId}
            name="txn-type-filter"
            value={typeFilter}
            onChange={(event) =>
              onTypeFilterChange(event.target.value as TypeFilter)
            }
            className="col-span-full row-start-1 appearance-none bg-transparent py-1 pr-7 pl-2.5 text-sm font-medium outline-none"
          >
            {typeOptions.map((value) => (
              <option key={value} value={value}>
                {filterLabels[value]}
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
      </div>
    </div>
  )
}

/** The sortable column header row (date / merchant / amount + a static Type column). */
function TransactionsTableHead({
  sortKey,
  sortDir,
  onToggleSort,
}: {
  sortKey: SortKey
  sortDir: SortDir
  onToggleSort: (key: SortKey) => void
}) {
  const t = useTranslations("transactions")

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key)
      return <ChevronsUpDown className="size-3.5 opacity-40" aria-hidden />
    return sortDir === "asc" ? (
      <ChevronUp className="size-3.5" aria-hidden />
    ) : (
      <ChevronDown className="size-3.5" aria-hidden />
    )
  }

  return (
    <thead>
      <tr className="border-b border-border text-left text-muted-foreground">
        <th
          scope="col"
          aria-sort={
            sortKey === "date"
              ? sortDir === "asc"
                ? "ascending"
                : "descending"
              : "none"
          }
          className="py-2 pr-4 font-medium whitespace-nowrap"
        >
          <button
            type="button"
            onClick={() => onToggleSort("date")}
            className={cn(
              "inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground",
              sortKey === "date" && "text-foreground"
            )}
          >
            {t("colDate")}
            {sortIndicator("date")}
          </button>
        </th>
        <th
          scope="col"
          aria-sort={
            sortKey === "merchant"
              ? sortDir === "asc"
                ? "ascending"
                : "descending"
              : "none"
          }
          className="py-2 pr-4 font-medium whitespace-nowrap"
        >
          <button
            type="button"
            onClick={() => onToggleSort("merchant")}
            className={cn(
              "inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground",
              sortKey === "merchant" && "text-foreground"
            )}
          >
            {t("colMerchant")}
            {sortIndicator("merchant")}
          </button>
        </th>
        <th
          scope="col"
          aria-sort={
            sortKey === "amount"
              ? sortDir === "asc"
                ? "ascending"
                : "descending"
              : "none"
          }
          className="py-2 pr-4 text-right font-medium whitespace-nowrap"
        >
          <button
            type="button"
            onClick={() => onToggleSort("amount")}
            className={cn(
              "inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground",
              sortKey === "amount" && "text-foreground"
            )}
          >
            {t("colAmount")}
            {sortIndicator("amount")}
          </button>
        </th>
        <th scope="col" className="py-2 pr-4 font-medium whitespace-nowrap">
          {t("colCategory")}
        </th>
        <th scope="col" className="py-2 font-medium whitespace-nowrap">
          {t("colType")}
        </th>
      </tr>
    </thead>
  )
}

/** A single transaction row: date, merchant, amount (+ own share) and the inline Type control. */
function TransactionRowView({
  row,
  categoryLabel,
  fmtDate,
  fmtAmount,
  onOverrideChanged,
  onIncomeChanged,
  onExcludeChanged,
  onShareChanged,
  onRuleCreated,
  onDeleted,
}: {
  row: TransactionRow
  /** The row's effective Category label (override ?? classified), or null when Uncategorized. */
  categoryLabel: string | null
  fmtDate: (date: string) => string
  fmtAmount: (amount: number) => string
  onOverrideChanged: (next: {
    expenseType: ExpenseType | null
    hasOverride: boolean
  }) => void
  onIncomeChanged: (marked: boolean) => void
  onExcludeChanged: (next: { excluded: boolean; note: string | null }) => void
  onShareChanged: (share: number | null) => void
  onRuleCreated: () => void
  onDeleted: () => void
}) {
  const t = useTranslations("transactions")
  const isCredit = row.amount > 0
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-4 text-muted-foreground tabular-nums">
        {fmtDate(row.date)}
      </td>
      <td
        className={cn(
          "py-3 pr-4 font-medium",
          // Excluded rows read as struck-through: they count for nothing (ADR-0011).
          row.excluded && "text-muted-foreground line-through"
        )}
      >
        {row.merchant}
      </td>
      <td
        className={cn(
          "py-3 pr-4 text-right tabular-nums",
          isCredit &&
            !row.excluded &&
            "text-emerald-600 dark:text-emerald-500",
          row.excluded && "text-muted-foreground line-through"
        )}
      >
        {fmtAmount(row.amount)}
        {/* A Shared expense shows the full charge above and the counted Own share
            beneath, so the face value is never hidden (ADR-0014). */}
        {row.ownShareAmount !== null && !row.excluded && (
          <div className="text-xs font-normal text-muted-foreground">
            {t("yourShare", {
              amount: fmtAmount(row.ownShareAmount),
            })}
          </div>
        )}
      </td>
      <td
        className={cn(
          "py-3 pr-4 text-muted-foreground",
          row.excluded && "line-through"
        )}
      >
        {/* Effective Category (override wins over classified); an em dash reads as Uncategorized. */}
        {categoryLabel ?? "—"}
      </td>
      <td className="py-3">
        <RowTypeControl
          row={row}
          formatAmount={fmtAmount}
          onOverrideChanged={onOverrideChanged}
          onIncomeChanged={onIncomeChanged}
          onExcludeChanged={onExcludeChanged}
          onShareChanged={onShareChanged}
          // A new merchant rule re-types every matching row server-side (ADR-0012);
          // refresh so this period's other rows and the net summary reflect it.
          onRuleCreated={onRuleCreated}
          // Passing onDeleted is what surfaces the per-row Delete action (ADR-0026); the
          // rapid-review usage omits it, so Delete appears only in the table.
          onDeleted={onDeleted}
        />
      </td>
    </tr>
  )
}

/**
 * Inline reversal notice shown right after a soft-delete (ADR-0026). No toast primitive exists, so
 * this mirrors the inline reversible-action pattern in `upload-history.tsx`.
 */
function UndoBanner({
  merchant,
  onUndo,
}: {
  merchant: string
  onUndo: () => void
}) {
  const t = useTranslations("transactions")
  return (
    <div
      aria-live="polite"
      className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
    >
      <span className="text-muted-foreground">
        {t("deletedNotice", { merchant })}
      </span>
      <Button variant="ghost" size="sm" onClick={onUndo}>
        <Undo2 />
        {t("undo")}
      </Button>
    </div>
  )
}

/**
 * A soft-deleted row in the durable "Deleted" view (ADR-0026): the same columns as a live row but
 * struck through and read-only, with a single Restore action in place of the type control.
 */
function DeletedRowView({
  row,
  categoryLabel,
  fmtDate,
  fmtAmount,
  onRestore,
}: {
  row: TransactionRow
  categoryLabel: string | null
  fmtDate: (date: string) => string
  fmtAmount: (amount: number) => string
  onRestore: () => void
}) {
  const t = useTranslations("transactions")
  return (
    <tr className="border-b border-border text-muted-foreground last:border-0">
      <td className="py-3 pr-4 tabular-nums">{fmtDate(row.date)}</td>
      <td className="py-3 pr-4 font-medium line-through">{row.merchant}</td>
      <td className="py-3 pr-4 text-right tabular-nums line-through">
        {fmtAmount(row.amount)}
      </td>
      <td className="py-3 pr-4 line-through">{categoryLabel ?? "—"}</td>
      <td className="py-3">
        <Button variant="outline" size="sm" onClick={onRestore}>
          <RotateCcw />
          {t("restore")}
        </Button>
      </td>
    </tr>
  )
}

/** The no-match state shown when filters/search exclude every row this cycle. */
function NoMatch({ onClear }: { onClear: () => void }) {
  const t = useTranslations("transactions")
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <p className="text-sm font-medium">{t("noMatch")}</p>
      <p className="text-sm text-pretty text-muted-foreground">
        {t("noMatchBody")}
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-1 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        {t("clearFilters")}
      </button>
    </div>
  )
}

/**
 * A statement period's transactions (Phase H) with a single inline "Type" control per row
 * (<RowTypeControl>): a color-keyed pill that opens a menu holding every per-row action (set type,
 * reset, apply-to-all rule, split, exclude / include, mark income). Each action persists and calls
 * back so the row updates locally and the server-derived summary refreshes.
 *
 * Rendered as a borderless table on a horizontal-scroll wrapper so it never breaks the page layout
 * on narrow screens (the per-row control keeps the table from collapsing into stacked cards).
 */
export function TransactionsTable({
  rows: initial,
  currency,
  categories = NO_CATEGORIES,
  initialCategoryId,
  initialDeleted = NO_ROWS,
  className,
  backlogElsewhere = 0,
}: {
  rows: TransactionRow[]
  currency: string
  /** This cycle's soft-deleted rows (ADR-0026), for the durable "Deleted" view. */
  initialDeleted?: TransactionRow[]
  /** The Household's Category leaves, to label each row's effective Category (ADR-0020). */
  categories?: CategoryOption[]
  /**
   * Pre-seed the Category filter (from `?category` — a leaf id, or `none` for Uncategorized). Lets a
   * click on the dashboard breakdown land here already filtered. Ignored when it matches no leaf.
   */
  initialCategoryId?: string
  className?: string
  /** Whole-household expenses still needing review — used only to explain an empty period. */
  backlogElsewhere?: number
  // react-doctor-disable-next-line react-doctor/prefer-useReducer -- the state atoms (server-data mirror, search query, type filter, sort key/dir) are largely independent UI controls, not one cohesive state machine; a reducer would harm readability
}) {
  const t = useTranslations("transactions")
  const locale = toLocale(useLocale()) ?? defaultLocale
  const categoryLabelOf = useCategoryLabel()
  // Category leaves keyed by id, so each row's effective Category (override ?? classified) resolves
  // to a localized label in one lookup; rebuilt only when the Household's categories change.
  const categoryParts = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  )
  const resolveCategory = (row: TransactionRow): string | null => {
    const id = effectiveCategoryId(row)
    if (id === null) return null
    const parts = categoryParts.get(id)
    return parts ? categoryLabelOf(parts) : null
  }
  // Seed the Category filter from the URL only when meaningful here: the `none` (Uncategorized)
  // sentinel, or a leaf the Household actually has. A stale/unknown id falls back to no filter.
  const seededCategoryFilter =
    initialCategoryId && (initialCategoryId === "none" || categoryParts.has(initialCategoryId))
      ? initialCategoryId
      : null
  // react-doctor-disable-next-line react-doctor/no-derived-useState -- `rows` is an intentional local mutable mirror seeded once from the server prop; the inline controls optimistically mutate it for instant feedback (router.refresh recomputes the server-derived summaries), so it must NOT be re-derived from `initial` on every render
  const [rows, setRows] = useState(initial)
  // react-doctor-disable-next-line react-doctor/no-derived-useState -- seeded once from the server prop like `rows`; delete/restore move rows between the two mirrors locally (router.refresh recomputes the server summaries), so it must NOT re-derive from `initialDeleted`
  const [deleted, setDeleted] = useState(initialDeleted)
  // The most-recently soft-deleted row, backing the inline Undo affordance; null once undone/dismissed.
  const [justDeleted, setJustDeleted] = useState<TransactionRow | null>(null)
  // Set when a restore request fails, so the failure is surfaced instead of silently swallowed.
  const [restoreError, setRestoreError] = useState(false)
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  // react-doctor-disable-next-line react-doctor/no-derived-useState -- one-time seed from the URL param (like `rows`); the chip's clear button owns it thereafter, so it must not re-derive from the prop
  const [categoryFilter, setCategoryFilter] = useState<string | null>(seededCategoryFilter)
  const [sortKey, setSortKey] = useState<SortKey>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const router = useRouter()

  // Derive the shown rows from the (stateful) period rows so inline override/income edits — which
  // mutate `rows` — re-filter and re-sort in place. Cheap: one cycle's rows are bounded.
  const visible = useMemo(
    () => filterAndSortRows(rows, query, typeFilter, categoryFilter, sortKey, sortDir),
    [rows, query, typeFilter, categoryFilter, sortKey, sortDir]
  )

  const filtering = query.trim() !== "" || typeFilter !== "all" || categoryFilter !== null

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(key)
    // Text reads best A→Z; dates and amounts most-useful largest-first.
    setSortDir(key === "merchant" ? "asc" : "desc")
  }

  function clearFilters() {
    setQuery("")
    setTypeFilter("all")
    setCategoryFilter(null)
  }

  // Options for the Category filter select: "All", then each Category present in this cycle's rows
  // (plus the active filter even when it has no rows here — e.g. a dashboard deep-link), then
  // "Uncategorized" when any row lacks a Category. Sorted by label; the select hides when there's
  // nothing to filter (only "All").
  const categoryOptions = useMemo(
    () =>
      buildCategoryOptions(
        rows,
        categoryFilter,
        categoryParts,
        categoryLabelOf,
        t("filter.allCategories"),
        t("uncategorized")
      ),
    [rows, categoryFilter, categoryParts, categoryLabelOf, t]
  )

  const money = currencyFormatter(currency, locale)
  const fmtAmount = (amount: number) => money.format(amount)

  const fmtDate = (date: string) =>
    formatDate(new Date(date), locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })

  // Apply an optimistic local patch to a row, then refresh. The row updates instantly for feedback
  // while the server-derived figures (net summary, Rapid review badge, expense-type buckets)
  // recompute — the shared shape of every inline control (override, income, exclude, share).
  function patchRow(id: string, patch: Partial<TransactionRow>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row))
    )
    router.refresh()
  }

  const handleChanged = (
    id: string,
    next: { expenseType: ExpenseType | null; hasOverride: boolean }
  ) => patchRow(id, { overrideType: next.hasOverride ? next.expenseType : null })

  const handleIncomeChanged = (id: string, incomeMarked: boolean) =>
    patchRow(id, { incomeMarked })

  const handleExcludeChanged = (
    id: string,
    next: { excluded: boolean; note: string | null }
  ) =>
    // Excluding clears any income mark (ADR-0011) and Own share (ADR-0014) — both mutually exclusive
    // with Excluded; mirror the server so the row stays consistent without a round-trip. Re-including
    // leaves them untouched (the patch omits them).
    patchRow(id, {
      excluded: next.excluded,
      exclusionNote: next.note,
      ...(next.excluded ? { incomeMarked: false, ownShareAmount: null } : {}),
    })

  const handleShareChanged = (id: string, ownShareAmount: number | null) =>
    patchRow(id, { ownShareAmount })

  // RowTypeControl already soft-deleted the row on the server (ADR-0026); move it from the live
  // mirror to the deleted one, surface an inline Undo, and refresh so the server-derived summaries
  // drop it. Local mirrors keep the two views consistent without a remount (the prop mirrors seed
  // once). We hold the whole row so Undo can re-insert it without a re-fetch.
  function handleDeleted(row: TransactionRow) {
    setRestoreError(false)
    setRows((current) => current.filter((r) => r.id !== row.id))
    setDeleted((current) => [row, ...current])
    setJustDeleted(row)
    router.refresh()
  }

  // Restore a soft-deleted row (from the Undo affordance or the Deleted view): un-delete on the
  // server, then move it back to the live mirror. On failure the row stays deleted and we surface an
  // error so it isn't silently lost. Re-sorting in `visible` puts a restored row back in date order.
  async function restore(row: TransactionRow) {
    setRestoreError(false)
    try {
      await restoreTransaction(row.id)
    } catch {
      setRestoreError(true)
      return
    }
    setDeleted((current) => current.filter((r) => r.id !== row.id))
    setRows((current) => [...current, row])
    setJustDeleted((j) => (j?.id === row.id ? null : j))
    router.refresh()
  }

  if (rows.length === 0 && deleted.length === 0) {
    return (
      <EmptyPeriod backlogElsewhere={backlogElsewhere} className={className} />
    )
  }

  const showingDeleted = typeFilter === "deleted"
  // The Deleted view honors the search box (by merchant) and shows newest-first; the type/category
  // filters and the column sort apply to the live view only.
  const needle = query.trim().toLowerCase()
  const deletedShown = deleted
    .filter((r) => needle === "" || r.merchant.toLowerCase().includes(needle))
    .toSorted((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
  const shown = showingDeleted ? deletedShown : visible

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {justDeleted && (
        <UndoBanner
          merchant={justDeleted.merchant}
          onUndo={() => void restore(justDeleted)}
        />
      )}

      {restoreError && (
        <p role="alert" className="text-xs text-destructive">
          {t("restoreError")}
        </p>
      )}

      <TableToolbar
        query={query}
        onQueryChange={setQuery}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        deletedCount={deleted.length}
        categoryOptions={categoryOptions}
        categoryValue={categoryFilter ?? "all"}
        onCategoryChange={(value) => setCategoryFilter(value === "all" ? null : value)}
      />

      {filtering && !showingDeleted && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {t("showingCount", { visible: visible.length, total: rows.length })}
        </p>
      )}

      {shown.length === 0 ? (
        showingDeleted ? (
          <p className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
            {t("noDeleted")}
          </p>
        ) : (
          <NoMatch onClear={clearFilters} />
        )
      ) : (
        <div className="-mx-6 -my-2 overflow-x-auto whitespace-nowrap">
          <div className="inline-block min-w-full px-6 py-2 align-middle">
            <table className="w-full border-collapse text-sm">
              <TransactionsTableHead
                sortKey={sortKey}
                sortDir={sortDir}
                onToggleSort={toggleSort}
              />
              <tbody>
                {showingDeleted
                  ? deletedShown.map((row) => (
                      <DeletedRowView
                        key={row.id}
                        row={row}
                        categoryLabel={resolveCategory(row)}
                        fmtDate={fmtDate}
                        fmtAmount={fmtAmount}
                        onRestore={() => void restore(row)}
                      />
                    ))
                  : visible.map((row) => (
                      <TransactionRowView
                        key={row.id}
                        row={row}
                        categoryLabel={resolveCategory(row)}
                        fmtDate={fmtDate}
                        fmtAmount={fmtAmount}
                        onOverrideChanged={(next) => handleChanged(row.id, next)}
                        onIncomeChanged={(marked) =>
                          handleIncomeChanged(row.id, marked)
                        }
                        onExcludeChanged={(next) =>
                          handleExcludeChanged(row.id, next)
                        }
                        onShareChanged={(share) => handleShareChanged(row.id, share)}
                        onRuleCreated={() => router.refresh()}
                        onDeleted={() => handleDeleted(row)}
                      />
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
