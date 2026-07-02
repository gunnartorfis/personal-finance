import { AccountView } from "@neondatabase/auth-ui"

import { HouseholdReset } from "@/components/household-reset"
import { requireUser } from "@/lib/auth/session"
import { isHouseholdResetEnabled } from "@/lib/household/reset-availability"

// Auth-scoped, per-request session UI: always render dynamically (no static prerender).
export const dynamic = "force-dynamic"

/**
 * Account profile settings (ADR-0001), now under the Settings hub: renders Neon Auth's account view.
 * The provider maps the SETTINGS view to `/settings/account` (basePath `/settings`), so this is
 * where the sidebar menu's Settings → Account and the view's own "Account" tab resolve.
 * `requireUser()` enforces the signed-in guard and redirects to sign-in otherwise.
 *
 * When the household reset tool is enabled (`ENABLE_HOUSEHOLD_RESET`), a "Danger zone" for wiping
 * the household's transaction data is appended below the Neon Auth view.
 */
export default async function AccountSettingsPage() {
  await requireUser()
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <AccountView path="account" />
      {isHouseholdResetEnabled() && <HouseholdReset />}
    </div>
  )
}
