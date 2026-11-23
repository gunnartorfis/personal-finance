"use client"

import { ChevronDown, ChevronsUpDown, ChevronUp, RotateCcw, Search, SlidersHorizontal, Undo2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useId, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from "react"

import { ClassifyTrigger } from "@/components/classify-trigger"
import { RowTypeControl } from "@/components/row-type-control"
import { TransactionSelectionActions } from "@/components/transaction-selection-actions"
import { BulkUpdateFeedback, TransactionListStatus, useTransactionSelection } from "@/components/transaction-table-selection"
import { TransactionReportingMonth } from "@/components/transaction-reporting-month"
import { Button } from "@/components/ui/button"
import { Menu, MenuCheckboxItem, MenuContent, MenuTrigger } from "@/components/ui/menu"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useCategoryLabel } from "@/lib/categories/label"
import { currencyFormatter } from "@/lib/format/currency"
import { formatCycleMonth, formatDate } from "@/lib/format/date"
import { defaultLocale, toLocale } from "@/lib/i18n/config"
import { restoreTransaction } from "@/lib/transactions/delete-client"
import { cn } from "@/lib/utils"
import { useExpenseTypeLabels } from "@/lib/expense-type-labels"
import type { ExpenseType } from "@/shared/types"

/** A row's effective bucket for filtering: excluded, an expense type, an unreviewed debit, or a credit. */
type TypeBucket = ExpenseType | "unclassified" | "credit" | "excluded" | "transfer"
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
  "transfer",
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
  if (row.transferGroupId || ((row.ownAccountCredit || row.sharedTransferRuleApplies) && !row.incomeMarked)) return "transfer"
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
  accountFilter: string | null,
  sortKey: SortKey,
  sortDir: SortDir
): TransactionRow[] {
  const needle = query.trim().toLowerCase()
  const filtered = rows.filter((row) => {
    if (accountFilter !== null && row.accountId !== accountFilter) return false
    if (typeFilter !== "all" && bucketOf(row) !== typeFilter) return false
    if (categoryFilter !== null) {
      const catId = effectiveCategoryId(row)
      // `none` keeps only Uncategorized rows; otherwise keep rows whose effective Category matches.
      if (categoryFilter === "none" ? catId !== null : catId !== categoryFilter) return false
    }
    if (needle && !row.merchant.toLowerCase().includes(needle)) return false
    return true
  })
  return sortRows(filtered, sortKey, sortDir)
}

function sortRows(rows: TransactionRow[], sortKey: SortKey, sortDir: SortDir) {
  const dir = sortDir === "asc" ? 1 : -1
  return rows.toSorted((a, b) => {
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
  reportingMonth?: string | null
  merchant: string
  accountId?: string
  bankReference?: string | null
  transferGroupId?: string | null
  ownAccountCredit?: boolean
  sharedTransferRuleApplies?: boolean
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

type AccountOption = { id: string; name: string }
const NO_ACCOUNTS: AccountOption[] = []

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
  accounts,
  accountFilter,
  onAccountChange,
  children,
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
  accounts: AccountOption[]
  accountFilter: string | null
  onAccountChange: (value: string | null) => void
  children: ReactNode
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
    transfer: t("filter.transfers"),
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
  const accountFilterId = useId()

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
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

      <div className="flex flex-wrap items-center gap-2">
        {accounts.length > 0 && (
          <div className="relative inline-grid h-8 max-w-full grid-cols-[1fr_1.75rem] items-center rounded-md border border-border">
            <label className="sr-only" htmlFor={accountFilterId}>
              {t("accountFilterLabel")}
            </label>
            <select
              id={accountFilterId}
              name="txn-account-filter"
              value={accountFilter ?? ""}
              onChange={(event) => onAccountChange(event.target.value || null)}
              className="col-span-full row-start-1 min-w-0 appearance-none truncate bg-transparent py-1 pr-7 pl-2.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{t("allAccounts")}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none col-start-2 row-start-1 size-4 text-muted-foreground" aria-hidden />
          </div>
        )}
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
        {children}
      </div>
    </div>
  )
}

function SelectionCheckbox({
  label,
  checked,
  mixed = false,
  inputRef,
  onToggle,
}: {
  label: string
  checked: boolean
  mixed?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
  onToggle: (range: boolean) => void
}) {
  return (
    <label className="flex size-11 cursor-pointer touch-manipulation items-center justify-center">
      <input
        ref={(node) => {
          if (node) node.indeterminate = mixed
          if (inputRef) inputRef.current = node
        }}
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={({ nativeEvent }) => onToggle(nativeEvent instanceof MouseEvent && nativeEvent.shiftKey)}
        className="size-4 cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      />
    </label>
  )
}

/** The sortable columns and visible-row selection control. */
function TransactionsTableHead({
  sortKey,
  sortDir,
  onToggleSort,
  selection,
  showCategory,
  showAccount,
}: {
  sortKey: SortKey
  sortDir: SortDir
  onToggleSort: (key: SortKey) => void
  selection?: { checked: boolean; mixed: boolean; inputRef: RefObject<HTMLInputElement | null>; onToggle: () => void }
  showCategory: boolean
  showAccount: boolean
}) {
  const t = useTranslations("transactions")

  const columns: { key: SortKey; label: string; className?: string }[] = [
    { key: "merchant", label: t("colMerchant"), className: !selection ? "pl-3" : undefined },
    { key: "amount", label: t("colAmount"), className: "text-right lg:w-32" },
    { key: "date", label: t("colDate"), className: "w-24" },
  ]

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
    <thead className="bg-muted/55 text-xs">
      <tr className="border-b border-border text-left text-muted-foreground">
        {selection && (
          <th scope="col" className="w-11 p-0">
            <SelectionCheckbox label={t("selection.all")} {...selection} />
          </th>
        )}
        {columns.map(({ key, label, className }) => (
          <th
            key={key}
            scope="col"
            aria-sort={sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
            className={cn("pr-4 font-medium whitespace-nowrap", className)}
          >
            <button
              type="button"
              onClick={() => onToggleSort(key)}
              className={cn(
                "inline-flex min-h-11 touch-manipulation items-center gap-1 rounded-sm font-medium transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                sortKey === key && "text-foreground"
              )}
            >
              {label}
              {sortIndicator(key)}
            </button>
          </th>
        ))}
        {showCategory && (
          <th scope="col" className="py-2 pr-4 font-medium whitespace-nowrap lg:w-36">
            {t("colCategory")}
          </th>
        )}
        {showAccount && (
          <th scope="col" className="py-2 pr-4 font-medium whitespace-nowrap lg:w-36">
            {t("details.account")}
          </th>
        )}
        <th scope="col" className="py-2 pr-3 font-medium whitespace-nowrap lg:w-36">
          {t("colType")}
        </th>
      </tr>
    </thead>
  )
}

function openTransactionFromRow(event: ReactMouseEvent<HTMLTableRowElement>) {
  const { target, currentTarget } = event
  if (!(target instanceof Element) || !currentTarget.contains(target)) return
  if (target.closest("button, a, input, select, textarea, label") || window.getSelection()?.toString()) return
  currentTarget.querySelector<HTMLButtonElement>("[data-transaction-details]")?.click()
}

function TransactionDetailsTrigger({ row, onOpen }: { row: TransactionRow; onOpen: () => void }) {
  const t = useTranslations("transactions")
  const merchant = row.merchant.trim() || t("unknownMerchant")
  return (
    <SheetTrigger
      data-transaction-details
      aria-label={t("openDetails", { merchant })}
      onClick={onOpen}
      className="block max-w-44 truncate rounded-sm text-left underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring sm:max-w-72 lg:max-w-96"
    >
      {merchant}
    </SheetTrigger>
  )
}

function TransactionDetails({
  row,
  accountName,
  categoryLabel,
  currency,
  editable,
  onMoved,
}: {
  row: TransactionRow
  accountName?: string
  categoryLabel: string | null
  currency: string
  editable: boolean
  onMoved: (month: string) => void
}) {
  const t = useTranslations("transactions")
  const internalTransfer = useTranslations("internalTransferRule")
  const typeLabels = useExpenseTypeLabels()
  const locale = toLocale(useLocale()) ?? defaultLocale
  const bucket = bucketOf(row)
  const type =
    bucket === "transfer"
      ? row.transferGroupId || row.ownAccountCredit ? t("details.transfer") : internalTransfer("label")
      : bucket === "credit"
        ? t(row.incomeMarked ? "details.income" : "details.credit")
        : bucket === "excluded"
          ? t("filter.excluded")
          : bucket === "unclassified"
            ? t("filter.unclassified")
            : typeLabels[bucket]
  const source = {
    bank_sync: t("details.bankSync"),
    csv: t("details.csv"),
    manual: t("details.manual"),
  }
  const money = currencyFormatter(currency, locale)
  const fields = [
    {
      label: t("colDate"),
      value: formatDate(new Date(row.date), locale, { dateStyle: "long", timeZone: "UTC" }),
    },
    { label: t("details.account"), value: accountName },
    { label: t("details.source"), value: row.source && source[row.source] },
    { label: t("colType"), value: type },
    { label: t("colCategory"), value: categoryLabel ?? t("uncategorized") },
    { label: t("details.ownShare"), value: row.ownShareAmount !== null ? money.format(row.ownShareAmount) : null },
    { label: t("details.reference"), value: row.bankReference },
    { label: t("details.exclusionNote"), value: row.exclusionNote },
  ]

  return (
    <SheetContent className="w-full overflow-y-auto sm:max-w-md" showCloseButton={false}>
      <SheetHeader className="gap-2 pr-20">
        <SheetTitle className="text-lg wrap-break-word">
          {row.merchant.trim() || t("unknownMerchant")}
        </SheetTitle>
        <SheetDescription className="text-2xl font-semibold tabular-nums">
          {money.format(row.amount)}
        </SheetDescription>
      </SheetHeader>
      <SheetClose
        className="absolute top-6 right-6"
        render={<Button variant="outline" size="sm" />}
      >
        {t("details.close")}
      </SheetClose>
      <dl className="flex flex-col gap-3 border-t border-border p-6 text-sm">
        {fields.map(({ label, value }) => value && (
          <div key={label} className="grid grid-cols-[2fr_3fr] items-baseline gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 wrap-break-word">{value}</dd>
          </div>
        ))}
      </dl>
      <TransactionReportingMonth
        transactionId={row.id}
        date={row.date}
        reportingMonth={row.reportingMonth}
        editable={editable}
        onMoved={onMoved}
      />
      {row.reasoning && (
        <p className="border-t border-border p-6 text-sm wrap-break-word text-muted-foreground">
          {row.reasoning}
        </p>
      )}
    </SheetContent>
  )
}

/** A single transaction row: date, merchant, amount (+ own share) and the inline Type control. */
function TransactionRowView({
  row,
  categoryLabel,
  showCategory,
  accountName,
  selected,
  onSelect,
  fmtDate,
  fmtAmount,
  onOverrideChanged,
  onIncomeChanged,
  onExcludeChanged,
  onShareChanged,
  onRuleCreated,
  onDeleted,
  onOpenDetails,
}: {
  row: TransactionRow
  /** The row's effective Category label (override ?? classified), or null when Uncategorized. */
  categoryLabel: string | null
  showCategory: boolean
  accountName: string | null | undefined
  selected: boolean
  onSelect: (range: boolean) => void
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
  onOpenDetails: () => void
}) {
  const t = useTranslations("transactions")
  const isCredit = row.amount > 0
  const outsideTotals = row.excluded || bucketOf(row) === "transfer"
  return (
    <tr
      className={cn(
        "cursor-pointer border-b border-border last:border-0",
        selected ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-muted/40"
      )}
      onClick={openTransactionFromRow}
    >
      <td className="p-0">
        <SelectionCheckbox
          label={t("selection.row", { merchant: row.merchant.trim() || t("unknownMerchant") })}
          checked={selected}
          onToggle={onSelect}
        />
      </td>
      <td
        className={cn(
          "py-2 pr-4 font-medium",
          // Excluded rows read as struck-through: they count for nothing (ADR-0011).
          outsideTotals && "text-muted-foreground line-through"
        )}
      >
        <TransactionDetailsTrigger row={row} onOpen={onOpenDetails} />
      </td>
      <td
        className={cn(
          "py-2 pr-4 text-right tabular-nums",
          isCredit &&
            !outsideTotals &&
            "text-emerald-600 dark:text-emerald-500",
          outsideTotals && "text-muted-foreground line-through"
        )}
      >
        {fmtAmount(row.amount)}
        {/* A Shared expense shows the full charge above and the counted Own share
            beneath, so the face value is never hidden (ADR-0014). */}
        {row.ownShareAmount !== null && !outsideTotals && (
          <div className="text-xs font-normal text-muted-foreground">
            {t("yourShare", {
              amount: fmtAmount(row.ownShareAmount),
            })}
          </div>
        )}
      </td>
      <td className="py-2 pr-4 text-muted-foreground tabular-nums">
        {fmtDate(row.date)}
      </td>
      {showCategory && (
        <td className={cn("py-2 pr-4 text-muted-foreground", outsideTotals && "line-through")}>
          <span className="block max-w-44 truncate" title={categoryLabel ?? undefined}>{categoryLabel ?? "—"}</span>
        </td>
      )}
      {accountName !== undefined && (
        <td className="py-2 pr-4 text-muted-foreground">
          <span className="block max-w-44 truncate" title={accountName ?? undefined}>{accountName ?? "—"}</span>
        </td>
      )}
      <td className="py-2 pr-3">
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
  showCategory,
  accountName,
  fmtDate,
  fmtAmount,
  onRestore,
  onOpenDetails,
}: {
  row: TransactionRow
  categoryLabel: string | null
  showCategory: boolean
  accountName: string | null | undefined
  fmtDate: (date: string) => string
  fmtAmount: (amount: number) => string
  onRestore: () => void
  onOpenDetails: () => void
}) {
  const t = useTranslations("transactions")
  return (
    <tr className="cursor-pointer border-b border-border text-muted-foreground hover:bg-muted/40 last:border-0" onClick={openTransactionFromRow}>
      <td className="py-3 pr-4 pl-3 font-medium line-through">
        <TransactionDetailsTrigger row={row} onOpen={onOpenDetails} />
      </td>
      <td className="py-3 pr-4 text-right tabular-nums line-through">
        {fmtAmount(row.amount)}
      </td>
      <td className="py-3 pr-4 tabular-nums">{fmtDate(row.date)}</td>
      {showCategory && (
        <td className="py-3 pr-4 line-through">
          <span className="block max-w-44 truncate" title={categoryLabel ?? undefined}>{categoryLabel ?? "—"}</span>
        </td>
      )}
      {accountName !== undefined && (
        <td className="py-3 pr-4">
          <span className="block max-w-44 truncate" title={accountName ?? undefined}>{accountName ?? "—"}</span>
        </td>
      )}
      <td className="py-3 pr-3">
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

type TransactionLists = { rows: TransactionRow[]; deleted: TransactionRow[] }

/** Apply acknowledged row edits while a new server snapshot is loading. */
function useTransactionRows(initial: TransactionRow[], initialDeleted: TransactionRow[]) {
  const router = useRouter()
  const [local, setLocal] = useState<{
    initial: TransactionRow[]
    initialDeleted: TransactionRow[]
    lists: TransactionLists
  } | null>(null)
  const [justDeleted, setJustDeleted] = useState<TransactionRow | null>(null)
  const [restoreError, setRestoreError] = useState(false)

  function currentLists(snapshot: typeof local): TransactionLists {
    return snapshot?.initial === initial && snapshot.initialDeleted === initialDeleted
      ? snapshot.lists
      : { rows: initial, deleted: initialDeleted }
  }

  function updateLists(update: (current: TransactionLists) => TransactionLists, refresh = () => router.refresh()) {
    setLocal((snapshot) => ({
      initial,
      initialDeleted,
      lists: update(currentLists(snapshot)),
    }))
    refresh()
  }

  function patchRow(id: string, patch: Partial<TransactionRow>) {
    updateLists(({ rows, deleted }) => ({
      rows: rows.map((row) => row.id === id ? { ...row, ...patch } : row),
      deleted,
    }))
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

  function patchSelectedRows(ids: Set<string>, patch: Partial<TransactionRow>, refresh: () => void) {
    updateLists(({ rows, deleted }) => ({
      rows: rows.map((row) => ids.has(row.id) ? { ...row, ...patch } : row),
      deleted,
    }), refresh)
  }

  function handleDeleted(row: TransactionRow) {
    setRestoreError(false)
    setJustDeleted(row)
    updateLists(({ rows, deleted }) => ({
      rows: rows.filter((r) => r.id !== row.id),
      deleted: [row, ...deleted],
    }))
  }

  function removeMovedRow(id: string, refresh: () => void) {
    updateLists(({ rows, deleted }) => ({
      rows: rows.filter((row) => row.id !== id),
      deleted,
    }), refresh)
  }

  async function restore(row: TransactionRow) {
    setRestoreError(false)
    try {
      await restoreTransaction(row.id)
    } catch {
      setRestoreError(true)
      return
    }
    setJustDeleted((last) => last?.id === row.id ? null : last)
    updateLists(({ rows, deleted }) => ({
      rows: rows.some((r) => r.id === row.id) ? rows : [...rows, row],
      deleted: deleted.filter((r) => r.id !== row.id),
    }))
  }

  return {
    ...currentLists(local), justDeleted, restoreError, patchSelectedRows, handleDeleted,
    removeMovedRow, restore, handleChanged, handleIncomeChanged, handleExcludeChanged, handleShareChanged,
  }
}

function useTransactionCategories(
  categories: CategoryOption[],
  initialCategoryId: string | undefined,
  rows: TransactionRow[]
) {
  const t = useTranslations("transactions")
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
  // react-doctor-disable-next-line react-doctor/no-derived-useState -- one-time seed from the URL param (like `rows`); the chip's clear button owns it thereafter, so it must not re-derive from the prop
  const [categoryFilter, setCategoryFilter] = useState<string | null>(seededCategoryFilter)
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

  return { categoryFilter, setCategoryFilter, resolveCategory, categoryOptions }
}

function useTransactionFilters(
  rows: TransactionRow[],
  deleted: TransactionRow[],
  categories: CategoryOption[],
  initialCategoryId: string | undefined
) {
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [accountFilter, setAccountFilter] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const { categoryFilter, setCategoryFilter, resolveCategory, categoryOptions } =
    useTransactionCategories(categories, initialCategoryId, rows)

  // Derive the shown rows from the (stateful) period rows so inline override/income edits — which
  // mutate `rows` — re-filter and re-sort in place. Cheap: one cycle's rows are bounded.
  const visible = useMemo(
    () => filterAndSortRows(rows, query, typeFilter, categoryFilter, accountFilter, sortKey, sortDir),
    [rows, query, typeFilter, categoryFilter, accountFilter, sortKey, sortDir]
  )

  const filtering = query.trim() !== "" || typeFilter !== "all" || categoryFilter !== null || accountFilter !== null
  const showingDeleted = typeFilter === "deleted"
  // The Deleted view applies the account and merchant filters.
  const needle = query.trim().toLowerCase()
  const deletedShown = showingDeleted ? sortRows(
    deleted.filter((r) =>
      (accountFilter === null || r.accountId === accountFilter) &&
      (needle === "" || r.merchant.toLowerCase().includes(needle))
    ), sortKey, sortDir
  ) : NO_ROWS
  const shown = showingDeleted ? deletedShown : visible

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
    setAccountFilter(null)
  }

  return {
    query, setQuery, typeFilter, setTypeFilter, accountFilter, setAccountFilter,
    categoryFilter, setCategoryFilter, resolveCategory, categoryOptions,
    sortKey, sortDir, toggleSort, clearFilters, filtering, showingDeleted, visible, shown,
  }
}

function TransactionDisplayMenu({
  showCategory,
  setShowCategory,
  showAccount,
  setShowAccount,
  hasAccounts,
}: {
  showCategory: boolean
  setShowCategory: (checked: boolean) => void
  showAccount: boolean
  setShowAccount: (checked: boolean) => void
  hasAccounts: boolean
}) {
  const t = useTranslations("transactions")
  return (
    <Menu>
      <MenuTrigger render={<Button variant="outline" size="lg" className="touch-manipulation pointer-coarse:min-h-11" />}>
        <SlidersHorizontal aria-hidden />
        {t("display")}
      </MenuTrigger>
      <MenuContent align="end" className="motion-reduce:animate-none">
        <MenuCheckboxItem checked={showCategory} onCheckedChange={setShowCategory} className="pointer-coarse:min-h-11">
          {t("colCategory")}
        </MenuCheckboxItem>
        {hasAccounts && (
          <MenuCheckboxItem checked={showAccount} onCheckedChange={setShowAccount} className="pointer-coarse:min-h-11">
            {t("details.account")}
          </MenuCheckboxItem>
        )}
      </MenuContent>
    </Menu>
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
  accounts = NO_ACCOUNTS,
  initialCategoryId,
  cycle,
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
  accounts?: AccountOption[]
  /**
   * Pre-seed the Category filter (from `?category` — a leaf id, or `none` for Uncategorized). Lets a
   * click on the dashboard breakdown land here already filtered. Ignored when it matches no leaf.
   */
  initialCategoryId?: string
  cycle?: string
  className?: string
  /** Whole-household expenses still needing review — used only to explain an empty period. */
  backlogElsewhere?: number
  // react-doctor-disable-next-line react-doctor/prefer-useReducer -- the state atoms (server-data mirror, search query, type filter, sort key/dir) are largely independent UI controls, not one cohesive state machine; a reducer would harm readability
}) {
  const t = useTranslations("transactions")
  const locale = toLocale(useLocale()) ?? defaultLocale
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [movedTo, setMovedTo] = useState<string | null>(null)
  const [showCategory, setShowCategory] = useState(true)
  const [showAccount, setShowAccount] = useState(false)
  const router = useRouter()
  const {
    rows, deleted, justDeleted, restoreError, patchSelectedRows, handleDeleted, removeMovedRow, restore,
    handleChanged, handleIncomeChanged, handleExcludeChanged, handleShareChanged,
  } = useTransactionRows(initial, initialDeleted)
  const {
    query, setQuery, typeFilter, setTypeFilter, accountFilter, setAccountFilter,
    categoryFilter, setCategoryFilter, resolveCategory, categoryOptions,
    sortKey, sortDir, toggleSort, clearFilters, filtering, showingDeleted, visible, shown,
  } = useTransactionFilters(rows, deleted, categories, initialCategoryId)
  const refreshCycle = useCallback(() => {
    const url = new URL(window.location.href)
    // The default landing month can change as the review queue is updated. Keep this month selected.
    if (cycle && url.searchParams.get("cycle") !== cycle) {
      url.searchParams.set("cycle", cycle)
      router.replace(url.pathname + url.search, { scroll: false })
    } else {
      router.refresh()
    }
  }, [cycle, router])

  const {
    sectionRef, selectionBarRef, selectAllRef, selectedIds, selectedCount, updates,
    allSelected, saving, bulkResult, clearSelection, toggleSelection, toggleAll, updateSelected,
  } = useTransactionSelection(showingDeleted ? NO_ROWS : visible, (ids, patch) => {
    patchSelectedRows(ids, patch, refreshCycle)
  })

  const money = currencyFormatter(currency, locale)
  const fmtAmount = (amount: number) => money.format(amount)

  const fmtDate = (date: string) =>
    formatDate(new Date(date), locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })

  const movedLabel = movedTo ? formatCycleMonth(movedTo, locale) : null
  const moveNotice = movedTo && movedLabel && (
    <p role="status" className="flex flex-wrap items-center gap-x-3 text-sm">
      {t("reportingMonth.moved", { month: movedLabel })}
      <Link href={`/transactions?cycle=${movedTo}`} className="font-medium underline underline-offset-4">
        {t("reportingMonth.view", { month: movedLabel })}
      </Link>
    </p>
  )

  if (rows.length === 0 && deleted.length === 0) {
    if (moveNotice) {
      return (
        <div className={cn("flex flex-col gap-3", className)}>
          {moveNotice}
          <EmptyPeriod backlogElsewhere={backlogElsewhere} />
        </div>
      )
    }
    return (
      <EmptyPeriod backlogElsewhere={backlogElsewhere} className={className} />
    )
  }

  const reclassifyCount = cycle
    ? initial.filter((row) =>
        row.amount < 0 &&
        row.merchant.trim() &&
        !row.excluded &&
        bucketOf(row) !== "transfer" &&
        row.overrideType === null &&
        row.overrideCategoryId === null
      ).length
    : 0
  const accountNames = new Map(accounts.map(({ id, name }) => [id, name]))
  const accountColumnVisible = showAccount && accounts.length > 0
  const accountCell = (row: TransactionRow) =>
    accountColumnVisible ? accountNames.get(row.accountId ?? "") ?? null : undefined
  const details = rows.find((row) => row.id === detailsId) ?? deleted.find((row) => row.id === detailsId)
  return (
    <div ref={sectionRef} className={cn("flex min-w-0 flex-col gap-3", selectedCount > 0 && "pb-32", className)}>
      {moveNotice}
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

      {cycle && reclassifyCount > 0 && (
        <ClassifyTrigger
          cycle={cycle}
          pendingCount={reclassifyCount}
          onSettled={refreshCycle}
          className="items-end"
        />
      )}

      <TableToolbar
        accounts={accounts}
        accountFilter={accountFilter}
        onAccountChange={(value) => {
          clearSelection()
          setAccountFilter(value)
        }}
        query={query}
        onQueryChange={(value) => {
          clearSelection()
          setQuery(value)
        }}
        typeFilter={typeFilter}
        onTypeFilterChange={(value) => {
          clearSelection()
          setTypeFilter(value)
        }}
        deletedCount={deleted.length}
        categoryOptions={categoryOptions}
        categoryValue={categoryFilter ?? "all"}
        onCategoryChange={(value) => {
          clearSelection()
          setCategoryFilter(value === "all" ? null : value)
        }}
      >
        <TransactionDisplayMenu
          showCategory={showCategory}
          setShowCategory={setShowCategory}
          showAccount={showAccount}
          setShowAccount={setShowAccount}
          hasAccounts={accounts.length > 0}
        />
      </TableToolbar>

      {filtering && !showingDeleted && shown.length === 0 && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {t("showingCount", { visible: visible.length, total: rows.length })}
        </p>
      )}

      {shown.length === 0 && <BulkUpdateFeedback result={bulkResult} />}

      <Sheet
        open={detailsId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailsId(null)
        }}
      >
        {shown.length === 0 ? (
          showingDeleted ? (
            <p className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
              {t("noDeleted")}
            </p>
          ) : (
            <NoMatch onClear={() => {
              clearSelection()
              clearFilters()
            }} />
          )
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <TransactionListStatus
              result={selectedCount === 0 ? bulkResult : null}
              visibleCount={shown.length}
              totalCount={!showingDeleted && filtering ? rows.length : undefined}
            />
            <div className={cn(
              "overflow-x-auto rounded-b-lg",
              selectedCount > 0 && "[&_:is(button,input)]:scroll-mb-32"
            )}>
              <table aria-label={t("pageTitle")} className="w-full min-w-max border-collapse text-sm whitespace-nowrap">
                <TransactionsTableHead
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onToggleSort={toggleSort}
                  selection={showingDeleted ? undefined : {
                    checked: allSelected,
                    mixed: selectedCount > 0 && !allSelected,
                    inputRef: selectAllRef,
                    onToggle: toggleAll,
                  }}
                  showCategory={showCategory}
                  showAccount={accountColumnVisible}
                />
                <tbody>
                  {showingDeleted
                    ? shown.map((row) => (
                        <DeletedRowView
                          key={row.id}
                          row={row}
                          categoryLabel={resolveCategory(row)}
                          showCategory={showCategory}
                          accountName={accountCell(row)}
                          fmtDate={fmtDate}
                          fmtAmount={fmtAmount}
                          onRestore={() => void restore(row)}
                          onOpenDetails={() => setDetailsId(row.id)}
                        />
                      ))
                    : visible.map((row) => (
                        <TransactionRowView
                          key={row.id}
                          row={row}
                          categoryLabel={resolveCategory(row)}
                          showCategory={showCategory}
                          accountName={accountCell(row)}
                          selected={selectedIds.has(row.id)}
                          onSelect={(range) => toggleSelection(row.id, range)}
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
                          onOpenDetails={() => setDetailsId(row.id)}
                        />
                      ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {details && (
          <TransactionDetails
            key={details.id}
            row={details}
            accountName={accountNames.get(details.accountId ?? "")}
            categoryLabel={resolveCategory(details)}
            currency={currency}
            editable={rows.some(({ id }) => id === details.id)}
            onMoved={(month) => {
              setDetailsId((id) => id === details.id ? null : id)
              setMovedTo(month)
              removeMovedRow(details.id, refreshCycle)
            }}
          />
        )}
      </Sheet>
      {selectedCount > 0 && (
        <TransactionSelectionActions
          barRef={selectionBarRef}
          sectionRef={sectionRef}
          selectedCount={selectedCount}
          updates={updates}
          allSelected={allSelected}
          saving={saving}
          result={bulkResult}
          onSelectAll={toggleAll}
          onClear={clearSelection}
          onUpdate={updateSelected}
        />
      )}
    </div>
  )
}
