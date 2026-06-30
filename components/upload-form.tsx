"use client"

import { type FormEvent, useEffect, useState } from "react"

import { UploadProgress } from "@/components/upload-progress"
import { cn } from "@/lib/utils"

interface Account {
  id: string
  name: string
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
  const [accountId, setAccountId] = useState("")
  const [file, setFile] = useState<File | null>(null)
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
        if (!ignore) setAccounts(data)
      } catch {
        // leave the selector empty; the submit guard blocks an upload with no account
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
    <section className={cn("flex flex-col gap-4", className)}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="upload-account" className="text-sm text-muted-foreground">
            Account
          </label>
          <select
            id="upload-account"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            required
            className="rounded-md border border-border bg-transparent px-2 py-1 text-sm"
          >
            <option value="" disabled>
              Select an account…
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="upload-file" className="text-sm text-muted-foreground">
            CSV file
          </label>
          <input
            id="upload-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={busy || !file || !accountId}
          className="self-start rounded-md border border-border px-3 py-1 text-sm font-medium disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {uploadId && <UploadProgress uploadId={uploadId} />}
    </section>
  )
}
