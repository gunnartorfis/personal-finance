"use client"

import { ClerkProvider } from "@clerk/nextjs"

import { ReverificationProvider } from "@/components/auth/reverification"

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      signInUrl="/auth/sign-in"
      signUpUrl="/auth/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      afterSignOutUrl="/"
    >
      <ReverificationProvider>{children}</ReverificationProvider>
    </ClerkProvider>
  )
}
