"use client"

import { CircleAlert, Loader2, Upload } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"

import { ClassifyTrigger } from "@/components/classify-trigger"
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
  error?: string
}

/** Human message for a non-2xx upload. The route returns `{ error }` for 400/413/422; 404 and 409
 * carry only a status, so map those by HTTP status. */
function uploadErrorMessage(status: number, body: UploadResponse | null): string {
  if (status === 409 || body?.status === "duplicate") return "This file was already imported."
  if (status === 404 || body?.status === "unknown-account") return "That account no longer exists."
  if (body?.error) return body.error
  return "Upload failed. Please try again."
}

/**
 * Upload a CSV statement (ADR-0003, Phase H): pick the Account it belongs to, choose the file, and
 * post it as multipart to `/api/uploads`. On success the created upload's id drives the live
 * <UploadProgress> indicator; 4xx failures surface inline.
 */
export function UploadForm({ className }: { className?: string }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [accountsError, setAccountsError] = useState(false)
  const [accountId, setAccountId] = useState("")
  const [file, setFile] = useState<File | null>(null)
  // Bumped on a successful upload to remount the file input, clearing its native selection.
  const [fileInputKey, setFileInputKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadId, setUploadId] = useState<string | null>(null)

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || !accountId) return
    setBusy(true)
    setError(null)
    setUploadId(null)
    try {
      const body = new FormData()
      body.set("file", file)
      body.set("accountId", accountId)
      const res = await fetch("/api/uploads", { method: "POST", body })
      const data = (await res.json().catch(() => null)) as UploadResponse | null
      if (!res.ok) {
        setError(uploadErrorMessage(res.status, data))
        return
      }
      if (data?.status === "created" && data.upload) {
        setUploadId(data.upload.id)
        // Clear the form so a stray second click can't re-post the same file (→ 409 duplicate).
        // Reset the account back to the default rather than blank so the picker-less single-account
        // flow stays submittable.
        setFile(null)
        setAccountId(defaultAccountId(accounts))
        setFileInputKey((key) => key + 1)
      } else {
        setError(uploadErrorMessage(res.status, data))
      }
    } catch {
      setError("Upload failed. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={cn("flex flex-col gap-6", className)}>
      <form
        onSubmit={submit}
        className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6"
      >
        {/* The account picker only appears when there's a genuine choice. A household always has a
            default account, so a single-account household uploads straight to it — no picker. */}
        {loadingAccounts ? (
          <p className="text-sm text-muted-foreground">Loading accounts…</p>
        ) : accountsError ? (
          <p role="alert" className="text-sm text-destructive">
            Couldn’t load accounts — try refreshing.
          </p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No account found — add one on the Accounts page first.
          </p>
        ) : accounts.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="upload-account" className="text-sm font-medium">
              Account
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
            CSV file
          </label>
          <Input
            key={fileInputKey}
            id="upload-file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <p className="text-sm text-muted-foreground">
            Export your statement as CSV, then choose it here.
          </p>
        </div>

        <Button type="submit" disabled={busy || !file || !accountId} className="self-start">
          {busy ? <Loader2 className="animate-spin" /> : <Upload />}
          {busy ? "Uploading…" : "Upload"}
        </Button>
      </form>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {uploadId && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
          {/* Kick classification for the rows just appended, then watch it drain. */}
          <ClassifyTrigger autoRun />
          <UploadProgress uploadId={uploadId} />
        </div>
      )}
    </section>
  )
}
