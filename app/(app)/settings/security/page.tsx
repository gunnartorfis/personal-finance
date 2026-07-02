import { AccountView } from "@neondatabase/auth-ui"

import { requireUser } from "@/lib/auth/session"

// Auth-scoped, per-request session UI: always render dynamically (no static prerender).
export const dynamic = "force-dynamic"

/**
 * Account security settings (ADR-0001), under the Settings hub at `/settings/security`: renders Neon
 * Auth's security view (sessions, passkeys, password). Nav comes from the shared settings layout, so
 * the view's own tabs are hidden (`hideNav`). `requireUser()` enforces the signed-in guard.
 */
export default async function SecuritySettingsPage() {
  await requireUser()
  return (
    <div className="flex flex-col gap-6">
      <AccountView path="security" hideNav />
    </div>
  )
}
