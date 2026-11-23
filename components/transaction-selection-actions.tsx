"use client"

import { Autocomplete } from "@base-ui/react/autocomplete"
import { Dialog } from "@base-ui/react/dialog"
import { Command, Search, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState, type RefObject } from "react"

import { BulkUpdateFeedback, type BulkTransactionUpdate, type BulkUpdateResult } from "@/components/transaction-table-selection"
import { Button } from "@/components/ui/button"

type SelectionCommand = BulkTransactionUpdate | { id: "select-all"; label: string }

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

  const commands: SelectionCommand[] = allSelected
    ? updates
    : [...updates, { id: "select-all", label: t("selection.all") }]

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
            <Autocomplete.Root items={commands} inline open autoHighlight>
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
                {(command: SelectionCommand) => (
                  <Autocomplete.Item
                    key={command.id}
                    value={command}
                    onClick={() => {
                      setOpen(false)
                      if ("persist" in command) void onUpdate(command)
                      else onSelectAll()
                    }}
                    className="flex min-h-10 cursor-default items-center justify-between gap-3 rounded-md px-2 text-sm data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground pointer-coarse:min-h-11"
                  >
                    <span>{command.label}</span>
                    {"rows" in command && command.rows.length < selectedCount && (
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {t("selection.appliesTo", { count: command.rows.length, total: selectedCount })}
                      </span>
                    )}
                  </Autocomplete.Item>
                )}
              </Autocomplete.List>
            </Autocomplete.Root>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
