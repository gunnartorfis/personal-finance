"use client"

import { CircleAlert, Loader2, Upload } from "lucide-react"
import { useTranslations } from "next-intl"
import { type FormEvent, useEffect, useState } from "react"

import { ClassifyTrigger } from "@/components/classify-trigger"
import {
  ImportPreview,
  type ColumnMapping,
  type UploadPreviewData,
} from "@/components/import-preview"
import {
  ImportSummaryCard,
  type AlreadyImportedRow,
  type CouldntReadRow,
  type ImportSummary,
  type RecoveredOutcome,
} from "@/components/import-summary"
import { applyForced, applyRecovered } from "@/components/import-summary-model"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { UploadProgress } from "@/components/upload-progress"
import { cn } from "@/lib/utils"

interface Account {
  id: string
  name: string
  isDefault: boolean
}

/** The account to pre-select: the household's default, falling back to the first (or none). */
function defaultAccountId(list: Account[]): string {
  return (list.find((a) => a.isDefault) ?? list[0])?.id ?? ""
}

/** Shape of the relevant `POST /api/uploads` JSON (subset we act on). */
interface UploadResponse {
  status?: string
  upload?: { id: string }
  appended?: number
  duplicates?: number
  alreadyImported?: AlreadyImportedRow[]
  couldntRead?: CouldntReadRow[]
  couldntReadTotal?: number
  ignoredCount?: number
  systematic?: boolean
  error?: string
}

/** `POST /api/uploads/preview` JSON: the `status:"ok"` body, or an error/unknown-account. */
type PreviewOk = { status: "ok" } & UploadPreviewData
type PreviewResponse = PreviewOk | { status?: "unknown-account"; error?: string }

/**
 * A non-success upload outcome, as either a translation key (mapped from the status/known statuses)
 * or a raw server message. The route returns `{ error }` for 400/413/422 (passed through as data —
 * the API owns that copy); an already-imported file is a 200 with `status: "duplicate"` (ADR-0018)
 * and an unknown account is a 404 with `status: "unknown-account"`, both mapped here to a catalog
 * key. Kept keyed (not pre-translated) so the alert re-translates on a locale change.
 */
type UploadError =
  | { key: "duplicate" | "unknownAccount" | "failed" }
  | { message: string }

function uploadError(status: number, body: UploadResponse | null): UploadError {
  if (body?.status === "duplicate") return { key: "duplicate" }
  if (status === 404 || body?.status === "unknown-account")
    return { key: "unknownAccount" }
  if (body?.error) return { message: body.error }
  return { key: "failed" }
}

/**
 * Upload a CSV statement (ADR-0003, Phase H): pick the Account it belongs to, choose the file, and
 * post it as multipart to `/api/uploads`. On success the created upload's id drives the live
 * <UploadProgress> indicator; 4xx failures surface inline.
 */
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent concerns (account load, form fields, upload mutation, preview/summary), not one cohesive state machine
export function UploadForm({ className }: { className?: string }) {
  const t = useTranslations("upload")
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [accountsError, setAccountsError] = useState(false)
  const [accountId, setAccountId] = useState("")
  const [file, setFile] = useState<File | null>(null)
  // Bumped on a successful upload to remount the file input, clearing its native selection.
  const [fileInputKey, setFileInputKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<UploadError | null>(null)
  const [uploadId, setUploadId] = useState<string | null>(null)
  // The pending Import preview (set when an import needs a human decision), and the post-import
  // summary (added / skipped counts) shown after a successful commit.
  const [preview, setPreview] = useState<UploadPreviewData | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  // Bumped when a recovered row is appended, to remount ClassifyTrigger and re-drive its resumable
  // drain (see handleRecovered) rather than firing a lone unobserved classify request.
  const [classifyRun, setClassifyRun] = useState(0)

  // react-doctor-disable-next-line react-doctor/no-fetch-in-effect -- one-shot client load already race-guarded by the `ignore` flag; server-side fetch is out of scope for this form
  useEffect(() => {
    let ignore = false
    async function loadAccounts() {
      try {
        const res = await fetch("/api/accounts")
        if (!res.ok) throw new Error("could not load accounts")
        const data = (await res.json()) as Account[]
        if (!ignore) {
          setAccounts(data)
          // Pre-select the default so a single-account household can upload without a picker.
          setAccountId(defaultAccountId(data))
        }
      } catch {
        if (!ignore) setAccountsError(true)
      } finally {
        if (!ignore) setLoadingAccounts(false)
      }
    }
    void loadAccounts()
    return () => {
      ignore = true
    }
  }, [])

  /** Fetch the dry-run preview; returns the ok body, or null after surfacing an error. */
  async function fetchPreview(): Promise<PreviewOk | null> {
    const body = new FormData()
    body.set("file", file as File)
    body.set("accountId", accountId)
    const res = await fetch("/api/uploads/preview", { method: "POST", body })
    const data = (await res.json().catch(() => null)) as PreviewResponse | null
    if (!res.ok || !data || data.status !== "ok") {
      setError(uploadError(res.status, data))
      return null
    }
    return data
  }

  /** Commit the import (optionally with a confirmed mapping); handles the created/duplicate result. */
  async function commit(mapping?: ColumnMapping) {
    const body = new FormData()
    body.set("file", file as File)
    body.set("accountId", accountId)
    if (mapping) body.set("mapping", JSON.stringify(mapping))
    const res = await fetch("/api/uploads", { method: "POST", body })
    const data = (await res.json().catch(() => null)) as UploadResponse | null
    if (!res.ok) {
      setError(uploadError(res.status, data))
      return
    }
    if (data?.status === "created" && data.upload) {
      setPreview(null)
      setUploadId(data.upload.id)
      setSummary({
        added: data.appended ?? 0,
        alreadyImported: data.duplicates ?? 0,
        alreadyImportedRows: data.alreadyImported ?? [],
        couldntRead: data.couldntRead ?? [],
        couldntReadTotal: data.couldntReadTotal ?? 0,
        ignoredCount: data.ignoredCount ?? 0,
        systematic: data.systematic ?? false,
      })
      // Clear the form so a stray second click can't re-post the same file (a duplicate no-op).
      // Reset the account back to the default rather than blank so the picker-less single-account
      // flow stays submittable.
      setFile(null)
      setAccountId(defaultAccountId(accounts))
      setFileInputKey((key) => key + 1)
    } else {
      // A file-hash duplicate (a re-upload) or any other non-created outcome surfaces as a notice.
      setPreview(null)
      setError(uploadError(res.status, data))
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || !accountId) return
    setBusy(true)
    setError(null)
    setUploadId(null)
    setSummary(null)
    setPreview(null)
    try {
      const data = await fetchPreview()
      if (!data) return
      // Interrupt only when unsure (ADR-0018): a confident mapping with new rows commits silently;
      // anything needing a decision (AI-suggested/unmatched columns, a whole-file duplicate, or a
      // file with no new rows at all — e.g. header-only) stops on the Import preview to confirm.
      const confident =
        data.newCount > 0 &&
        data.unmatchedRoles.length === 0 &&
        (data.mappingSource === "heuristic" || data.mappingSource === "remembered") &&
        !data.wholeFileDuplicate
      if (confident) await commit()
      else setPreview(data)
    } catch {
      setError({ key: "failed" })
    } finally {
      setBusy(false)
    }
  }

  async function confirmImport(mapping: ColumnMapping) {
    setBusy(true)
    setError(null)
    try {
      await commit(mapping)
    } catch {
      setError({ key: "failed" })
    } finally {
      setBusy(false)
    }
  }

  // Fix & import: fold the outcome into the summary (pure helper), then re-drive the resumable
  // ClassifyTrigger for the newly-pending row by remounting it (key bump) — resilient to a dropped
  // request or navigation, unlike a lone unobserved fetch.
  function handleRecovered(sourceRow: number, outcome: RecoveredOutcome) {
    setSummary((prev) => (prev ? applyRecovered(prev, sourceRow, outcome) : prev))
    if (outcome.appended > 0) setClassifyRun((run) => run + 1)
  }

  // Import anyway: same shape, but the row leaves the already-imported bucket instead.
  function handleForced(sourceRow: number, outcome: RecoveredOutcome) {
    setSummary((prev) => (prev ? applyForced(prev, sourceRow, outcome) : prev))
    if (outcome.appended > 0) setClassifyRun((run) => run + 1)
  }

  // Resolve to text at render (not when the error is raised) so the alert follows a locale change.
  // Keys are spelled out literally rather than interpolated so next-intl can statically check them.
  const errorText = !error
    ? null
    : "message" in error
      ? error.message
      : error.key === "duplicate"
        ? t("errors.duplicate")
        : error.key === "unknownAccount"
          ? t("errors.unknownAccount")
          : t("errors.failed")

  const accountName = accounts.find((a) => a.id === accountId)?.name ?? ""

  return (
    <section className={cn("flex flex-col gap-6", className)}>
      {!preview && (
      <form
        onSubmit={submit}
        className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6"
      >
        {/* The account picker only appears when there's a genuine choice. A household always has a
            default account, so a single-account household uploads straight to it — no picker. */}
        {loadingAccounts ? (
          <p className="text-sm text-muted-foreground">
            {t("loadingAccounts")}
          </p>
        ) : accountsError ? (
          <p role="alert" className="text-sm text-destructive">
            {t("accountsError")}
          </p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noAccount")}</p>
        ) : accounts.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="upload-account" className="text-sm font-medium">
              {t("accountLabel")}
            </label>
            <div className="grid grid-cols-[1fr_--spacing(7)] items-center rounded-md border border-input bg-input/20 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 dark:bg-input/30">
              <select
                id="upload-account"
                name="accountId"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                required
                className="col-span-full row-start-1 h-7 appearance-none bg-transparent py-0.5 pr-7 pl-2 text-sm outline-none"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
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
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="upload-file" className="text-sm font-medium">
            {t("fileLabel")}
          </label>
          <Input
            key={fileInputKey}
            id="upload-file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <p className="text-sm text-muted-foreground">{t("fileHint")}</p>
        </div>

        <Button
          type="submit"
          disabled={busy || !file || !accountId}
          className="self-start"
        >
          {busy ? <Loader2 className="animate-spin" /> : <Upload />}
          {busy ? t("reviewing") : t("submit")}
        </Button>
      </form>
      )}

      {preview && (
        <ImportPreview
          preview={preview}
          accountName={accountName}
          busy={busy}
          onConfirm={confirmImport}
          onCancel={() => setPreview(null)}
        />
      )}

      {errorText && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>{errorText}</p>
        </div>
      )}

      {summary && uploadId && (
        <ImportSummaryCard
          key={uploadId}
          summary={summary}
          uploadId={uploadId}
          onRecovered={handleRecovered}
          onForced={handleForced}
        />
      )}

      {uploadId && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
          {/* Kick classification for the rows just appended, then watch it drain. `resumable` marks
              the run so if the user leaves this page mid-drain, the standing controls (dashboard /
              transactions / banner) pick it back up. UploadProgress shows the per-upload bar here. */}
          <ClassifyTrigger key={`${uploadId}-${classifyRun}`} autoRun resumable />
          <UploadProgress uploadId={uploadId} />
        </div>
      )}
    </section>
  )
}
