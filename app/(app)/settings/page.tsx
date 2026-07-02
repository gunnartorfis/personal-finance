import { redirect } from "next/navigation"

// Auth- and tenant-scoped per-request data.
export const dynamic = "force-dynamic"

/** The Settings hub has no landing of its own — the layout's left nav is always present, so land on Account. */
export default function SettingsPage() {
  redirect("/settings/account")
}
