import { UploadForm } from "@/components/upload-form"
import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/** Statement upload (ADR-0003, Phase H): pick an account + CSV, ingest, and watch classification. */
export default async function UploadPage() {
  await requireHousehold() // gate on auth; the form fetches accounts client-side
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Upload a statement</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Import a CSV bank statement, then watch it classify.
        </p>
      </header>
      <UploadForm />
    </div>
  )
}
