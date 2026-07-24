import { getTranslations } from "next-intl/server"

import { UploadForm } from "@/components/upload-form"
import { UploadHistory } from "@/components/upload-history"
import { getDb } from "@/lib/db"
import { requireHousehold } from "@/lib/household/current"
import { listMembersWithIdentity } from "@/lib/household/members-view"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/**
 * Statement upload (ADR-0003, Phase H): pick an account + CSV, ingest, and watch classification.
 * Below the form, the Upload history (ADR-0024) lists every import newest-first with the Undo /
 * Restore controls. Member names are resolved here (server-side) from the ids `listHistory` returns
 * — a departed/unknown Member resolves to `null`, which the client renders generically.
 */
export default async function UploadPage() {
  const [{ householdId, repo }, t] = await Promise.all([
    requireHousehold(),
    getTranslations("upload"),
  ])
  const [history, members] = await Promise.all([
    repo.uploads.listHistory(),
    listMembersWithIdentity(getDb(), householdId),
  ])

  const nameById = new Map(members.map((m) => [m.id, m.name]))
  const nameFor = (memberId: string | null) =>
    memberId ? (nameById.get(memberId) ?? null) : null

  const items = history.map((h) => ({
    id: h.id,
    fileName: h.fileName,
    accountName: h.accountName,
    importedByName: nameFor(h.importedByMemberId),
    createdAt: h.createdAt.toISOString(),
    undoneAt: h.undoneAt ? h.undoneAt.toISOString() : null,
    undoneByName: nameFor(h.undoneByMemberId),
    transactionCount: h.transactionCount,
    supersededByReimport: h.supersededByReimport,
    status: h.undoneAt ? ("undone" as const) : ("active" as const),
  }))

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          {t("subtitle")}
        </p>
      </header>
      <UploadForm />
      <UploadHistory items={items} />
    </div>
  )
}
