import { UserProfile } from "@clerk/nextjs"

import { requireUser } from "@/lib/auth/session"

// Auth-scoped, per-request session UI: always render dynamically (no static prerender).
export const dynamic = "force-dynamic"

/** Clerk profile and security controls retain the application settings routes. */
export default async function SecuritySettingsPage() {
  await requireUser()
  return (
    <div className="flex flex-col gap-6">
      <UserProfile routing="hash" />
    </div>
  )
}
