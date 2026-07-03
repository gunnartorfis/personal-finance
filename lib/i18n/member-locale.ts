import { getCurrentUser } from "@/lib/auth/session"
import { getDb } from "@/lib/db"
import { findMemberLocale } from "@/lib/household/membership"
import type { Locale } from "@/lib/i18n/config"

/**
 * The signed-in Member's saved Locale, or `null` when logged out, not yet a
 * Member, or unset. Isolated here so the i18n resolver's coupling to auth + DB
 * stays out of the pure `resolveLocale` (ADR-0013).
 */
export async function currentMemberLocale(): Promise<Locale | null> {
  const user = await getCurrentUser()
  if (!user) return null
  return findMemberLocale(getDb(), user.id)
}
