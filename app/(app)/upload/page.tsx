import { UploadForm } from "@/components/upload-form"
import { requireHousehold } from "@/lib/household/current"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/** Statement upload (ADR-0003, Phase H): pick an account + CSV, ingest, and watch classification. */
export default async function UploadPage() {
  await requireHousehold() // gate on auth; the form fetches accounts client-side
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Upload a statement</h1>
      <UploadForm />
    </div>
  )
}
