import { AccountView } from "@neondatabase/auth-ui"

import { requireUser } from "@/lib/auth/session"

// Auth-scoped, per-request session UI: always render dynamically (no static prerender).
export const dynamic = "force-dynamic"

/**
 * Account security settings (ADR-0001), under the Settings hub at `/settings/security`: renders Neon
 * Auth's security view (sessions, passkeys, password). `requireUser()` enforces the signed-in guard.
 */
export default async function SecuritySettingsPage() {
  await requireUser()
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <AccountView path="security" />
    </div>
  )
}
