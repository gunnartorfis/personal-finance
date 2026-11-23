import { Sparkles } from "lucide-react"
import { useTranslations } from "next-intl"

import { CATEGORIES } from "@/components/spending-categories"
import { cn } from "@/lib/utils"
import type { ExpenseType } from "@/shared/types"

export function TransactionTypeDot({
  type,
  className,
}: {
  type?: ExpenseType
  className?: string
}) {
  const swatch = type === undefined
    ? undefined
    : CATEGORIES.find(({ key }) => key === (type || "Other"))?.swatch

  return <span className={cn("size-1.5 shrink-0 rounded-full", swatch, className)} aria-hidden />
}

export function AiTypeBadge() {
  const t = useTranslations("rowType")
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
      title={t("aiSuggestion")}
    >
      <Sparkles className="size-3" aria-hidden />
      {t("ai")}
    </span>
  )
}
