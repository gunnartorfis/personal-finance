import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { getDb } from "@/lib/db"
import { requireHousehold } from "@/lib/household/current"
import { updateMemberLocale } from "@/lib/household/membership"
import { toLocale } from "@/lib/i18n/config"
import { LOCALE_COOKIE } from "@/lib/i18n/locale"

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/**
 * Persist the signed-in Member's Locale (slice 3b, ADR-0013). Writes BOTH the
 * `member.locale` column (durable, cross-device) and the `NEXT_LOCALE` cookie
 * (the fast path locale resolution reads first). `requireHousehold` scopes the
 * write to the current tenant's Member.
 */
export async function PUT(request: Request) {
  const body = await request.json().catch(() => null)
  const locale = toLocale(body?.locale)
  if (!locale) {
    return NextResponse.json({ error: "unsupported locale" }, { status: 400 })
  }

  const { memberId } = await requireHousehold()
  await updateMemberLocale(getDb(), memberId, locale)

  const store = await cookies()
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
  })

  return NextResponse.json({ locale })
}
