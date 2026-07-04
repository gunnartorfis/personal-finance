"use client"

import { Sparkles } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { AssistantChat } from "@/components/assistant/assistant-chat"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

/**
 * The Assistant entry point (#101, slice 4a): a header button (⌘K / Ctrl-K also toggles it) that
 * opens a right-side drawer holding the chat. Premium gating + the daily cap are enforced by the API
 * and surfaced inside {@link AssistantChat}.
 */
export function AssistantLauncher() {
  const t = useTranslations("assistant")
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((previous) => !previous)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label={t("open")}
        aria-keyshortcuts="Meta+K"
        onClick={() => setOpen(true)}
      >
        <Sparkles />
        <span className="max-sm:sr-only">{t("title")}</span>
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b">
            <SheetTitle>{t("title")}</SheetTitle>
            <SheetDescription>{t("subtitle")}</SheetDescription>
          </SheetHeader>
          <AssistantChat />
        </SheetContent>
      </Sheet>
    </>
  )
}
