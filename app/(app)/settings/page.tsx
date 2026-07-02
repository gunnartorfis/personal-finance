import { redirect } from "next/navigation"

/** The Settings hub has no landing of its own — the layout's left nav is always present, so land on Account. */
export default function SettingsPage() {
  redirect("/settings/account")
}
