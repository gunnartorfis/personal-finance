import { AccountView } from "@neondatabase/auth-ui"

import { DevReset } from "@/components/dev-reset"
import { requireUser } from "@/lib/auth/session"
import { isDevResetEnabled } from "@/lib/dev/reset"

// Auth-scoped, per-request session UI: always render dynamically (no static prerender).
export const dynamic = "force-dynamic"

/**
 * Neon Auth catch-all account page (ADR-0001): renders the user settings / security views from the
 * path segment, e.g. `/account/settings`. This is where the sidebar `UserButton` menu links, whose
 * settings item defaults to `${basePath}/settings` (basePath `/account`). `requireUser()` enforces
 * the signed-in guard and redirects to sign-in otherwise.
 *
 * On the settings tab, and only when the staging-only dev reset tool is enabled, a "Danger zone"
 * for wiping the household's transaction data is appended below the Neon Auth view.
 */
export default async function AccountPage({
  params,
}: {
  params: Promise<{ path: string }>
}) {
  await requireUser()
  const { path } = await params
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <AccountView path={path} />
      {path === "settings" && isDevResetEnabled() && <DevReset />}
    </div>
  )
}
