"use client"

import { ClerkProvider } from "@clerk/nextjs"
import { enUS, isIS } from "@clerk/localizations"
import { useLocale } from "next-intl"

/** Provider UI catalogs follow the same locale as application chrome. */
export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocale()
  return (
    <ClerkProvider
      localization={locale === "is" ? isIS : enUS}
      signInUrl="/auth/sign-in"
      signUpUrl="/auth/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      afterSignOutUrl="/"
    >
      {children}
    </ClerkProvider>
  )
}
