"use client"

import { Autocomplete } from "@base-ui/react/autocomplete"
import { Dialog } from "@base-ui/react/dialog"
import { Ban, Check, CircleDollarSign, CircleMinus, Command, ListChecks, Search, Undo2, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState, type RefObject } from "react"

import { BulkUpdateFeedback, type BulkTransactionUpdate, type BulkUpdateResult } from "@/components/transaction-table-selection"
import { AiTypeBadge, TransactionTypeDot } from "@/components/transaction-type-indicators"
import { Button } from "@/components/ui/button"
import { useExpenseTypeLabels } from "@/lib/expense-type-labels"
import { cn } from "@/lib/utils"

type SelectionCommand = BulkTransactionUpdate | { id: "select-all"; label: string }

type SelectionCommandGroup = { id: string; label: string; items: SelectionCommand[] }

const ACTION_ICONS: Partial<Record<string, typeof Ban>> = {
  exclude: Ban,
  include: Undo2,
  reset: Undo2,
  income: CircleDollarSign,
  "unmark-income": CircleMinus,
  "select-all": ListChecks,
}

function commandExpenseType(command: SelectionCommand) {
  return "patch" in command ? command.patch.overrideType ?? undefined : undefined
}

function SelectionActionItem({
  command,
  selectedCount,
  onChoose,
}: {
  command: SelectionCommand
  selectedCount: number
  onChoose: (command: SelectionCommand) => void
}) {
  const t = useTranslations("transactions")
  const typeLabels = useExpenseTypeLabels()
  const type = commandExpenseType(command)
  const rows = "rows" in command ? command.rows : []
  const Icon = ACTION_ICONS[command.id]
  const hasType = rows.every((row) => row.classificationStatus === "classified" || row.overrideType !== null)
  const isCurrent = type !== undefined && hasType &&
    rows.every((row) => (row.overrideType ?? row.classifiedType ?? "") === type)
  const isSuggested = type !== undefined && hasType && rows.every((row) => row.classifiedType === type)

  return (
    <Autocomplete.Item
      value={command}
      onClick={() => onChoose(command)}
      className={cn(
        "flex min-h-10 cursor-default items-center gap-2 rounded-md px-2 text-sm data-[highlighted]:bg-accent pointer-coarse:min-h-11",
        command.id === "exclude" ? "text-destructive" : "data-[highlighted]:text-accent-foreground"
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
        {type !== undefined ? <TransactionTypeDot type={type} /> : Icon && <Icon className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">{type === undefined ? command.label : typeLabels[type]}</span>
      {rows.length > 0 && rows.length < selectedCount && (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {t("selection.appliesTo", { count: rows.length, total: selectedCount })}
        </span>
      )}
      {isSuggested && <AiTypeBadge />}
      {isCurrent && (
        <>
          <Check className="size-4 shrink-0" aria-hidden />
          <span className="sr-only">{t("selection.currentType")}</span>
        </>
      )}
    </Autocomplete.Item>
  )
}

export function TransactionSelectionActions({
  barRef,
  sectionRef,
  selectedCount,
  updates,
  allSelected,
  saving,
  result,
  onSelectAll,
  onClear,
  onUpdate,
}: {
  barRef: RefObject<HTMLDivElement | null>
  sectionRef: RefObject<HTMLDivElement | null>
  selectedCount: number
  updates: BulkTransactionUpdate[]
  allSelected: boolean
  saving: boolean
  result: BulkUpdateResult | null
  onSelectAll: () => void
  onClear: () => void
  onUpdate: (update: BulkTransactionUpdate) => Promise<void>
}) {
  const t = useTranslations("transactions")
  const rowLabel = useTranslations("rowType")
  const [open, setOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const actionsRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.altKey || event.shiftKey ||
          !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return
      const target = event.target
      if (!(target instanceof Element) ||
          !(sectionRef.current?.contains(target) || dialogRef.current?.contains(target))) return
      event.preventDefault()
      setOpen((previous) => !previous)
    }

    // Claim the shortcut before the Assistant's window listener.
    window.addEventListener("keydown", handleShortcut, { capture: true })
    return () => window.removeEventListener("keydown", handleShortcut, { capture: true })
  }, [sectionRef])

  const otherCommands: SelectionCommand[] = updates.filter((command) => commandExpenseType(command) === undefined)
  if (!allSelected) otherCommands.push({ id: "select-all", label: t("selection.all") })

  const groups: SelectionCommandGroup[] = [
    { id: "types", label: rowLabel("setType"), items: updates.filter((command) => commandExpenseType(command) !== undefined) },
    { id: "actions", label: t("selection.actions"), items: otherCommands },
  ].filter((group) => group.items.length > 0)

  function chooseCommand(command: SelectionCommand) {
    setOpen(false)
    if ("persist" in command) void onUpdate(command)
    else onSelectAll()
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div ref={barRef} className="pointer-events-none fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 flex justify-center">
        <div className="pointer-events-auto max-w-full rounded-2xl border border-border bg-popover px-2 py-1.5 text-popover-foreground shadow-lg">
          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
            <p role="status" className="px-2 text-sm font-medium tabular-nums">
              {t("selection.count", { count: selectedCount })}
            </p>
            <Dialog.Trigger
              ref={actionsRef}
              aria-keyshortcuts="Meta+K Control+K"
              render={<Button variant="secondary" size="lg" className="touch-manipulation pointer-coarse:min-h-11" />}
            >
              <Command aria-hidden />
              {saving ? t("selection.saving") : t("selection.actions")}
            </Dialog.Trigger>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label={t("selection.clear")}
              onClick={onClear}
              className="touch-manipulation pointer-coarse:size-11"
            >
              <X aria-hidden />
            </Button>
          </div>
          <BulkUpdateFeedback result={result} />
        </div>
      </div>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Popup
          ref={dialogRef}
          initialFocus={searchRef}
          finalFocus={actionsRef}
          className="fixed inset-x-3 top-[min(18vh,8rem)] z-50 mx-auto max-h-[70dvh] max-w-lg overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-xl outline-none"
        >
          <Dialog.Title className="sr-only">{t("selection.actions")}</Dialog.Title>
          <Dialog.Description className="sr-only">
            {t("selection.count", { count: selectedCount })}
          </Dialog.Description>
          {open && (
            <Autocomplete.Root items={groups} inline open autoHighlight>
              <div className="flex items-center gap-3 border-b border-border px-4">
                <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <Autocomplete.Input
                  ref={searchRef}
                  aria-label={t("selection.searchActions")}
                  placeholder={t("selection.searchActions")}
                  className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
                />
                <Dialog.Close
                  aria-label={t("details.close")}
                  render={<Button variant="ghost" size="icon-lg" className="pointer-coarse:size-11" />}
                >
                  <X aria-hidden />
                </Dialog.Close>
              </div>
              <Autocomplete.Empty className="px-4 py-3 text-sm text-muted-foreground empty:hidden">
                {t("selection.noActions")}
              </Autocomplete.Empty>
              <Autocomplete.List className="p-2">
                {(group: SelectionCommandGroup) => (
                  <Autocomplete.Group key={group.id} items={group.items} className="not-first:mt-1 not-first:border-t not-first:border-border not-first:pt-1">
                    <Autocomplete.GroupLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      {group.label}
                    </Autocomplete.GroupLabel>
                    <Autocomplete.Collection>
                      {(command: SelectionCommand) => (
                        <SelectionActionItem
                          key={command.id}
                          command={command}
                          selectedCount={selectedCount}
                          onChoose={chooseCommand}
                        />
                      )}
                    </Autocomplete.Collection>
                  </Autocomplete.Group>
                )}
              </Autocomplete.List>
            </Autocomplete.Root>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
