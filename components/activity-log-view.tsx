"use client"

import { useLocale, useTranslations } from "next-intl"

import { activityActionLabelKey } from "@/lib/activity/labels"
import type { ActivityLogEntry } from "@/lib/activity/load"
import { formatDate } from "@/lib/format/date"
import { defaultLocale, toLocale } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"

interface ActivityLogViewProps {
  entries: ActivityLogEntry[]
}

/**
 * A short, human subject to show beside the action — the merchant, invitee email, bank, or account
 * name carried in the entry's payload. These are user/merchant data (exempt from i18n) and may be
 * absent (many actions have no single subject), in which case the action label stands alone.
 */
function activitySubject(payload: ActivityLogEntry["payload"]): string | null {
  const p = (payload ?? {}) as Record<string, unknown>
  for (const key of ["merchant", "email", "institutionName", "name"]) {
    const value = p[key]
    if (typeof value === "string" && value.trim().length > 0) return value
  }
  return null
}

/**
 * The member-facing Activity log (ADR-0017): the household's append-only record of who did what,
 * when. A divider-separated list (siblings in one context, not standalone cards), newest-first,
 * read-only. Each row attributes the action to the actor-name snapshot and stamps a locale-formatted
 * time; a subject line surfaces the affected merchant/invitee/bank when the payload carries one.
 */
export function ActivityLogView({ entries }: ActivityLogViewProps) {
  const t = useTranslations("activityLog")
  const locale = toLocale(useLocale()) ?? defaultLocale

  if (entries.length === 0) {
    return <p className="text-sm text-pretty text-muted-foreground">{t("empty")}</p>
  }

  return (
    <ul role="list" className="flex flex-col">
      {entries.map((entry) => {
        const subject = activitySubject(entry.payload)
        const when = new Date(entry.createdAt)
        return (
          <li
            key={entry.id}
            className={cn(
              "flex items-start justify-between gap-4 border-t border-border py-4",
              "first:border-t-0 first:pt-0",
            )}
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm break-words text-foreground">
                <span className="font-medium">{entry.actorName}</span>{" "}
                {t(`actions.${activityActionLabelKey(entry.action)}`)}
              </p>
              {subject ? (
                <p className="truncate text-sm text-muted-foreground">{subject}</p>
              ) : null}
            </div>
            <time
              dateTime={when.toISOString()}
              className="shrink-0 text-sm text-muted-foreground tabular-nums"
            >
              {formatDate(when, locale, { dateStyle: "medium", timeStyle: "short" })}
            </time>
          </li>
        )
      })}
    </ul>
  )
}
