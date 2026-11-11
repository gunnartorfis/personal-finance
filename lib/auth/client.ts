"use client"

import { useClerk, useUser } from "@clerk/nextjs"

export function useAuthActions() {
  const clerk = useClerk()
  const { user } = useUser()
  return {
    async sendVerificationEmail({ email, callbackURL }: { email: string; callbackURL: string }) {
      const primary = user?.primaryEmailAddress
      if (!primary || primary.emailAddress !== email) return { error: true }
      await primary.prepareVerification({
        strategy: "email_link",
        redirectUrl: new URL(callbackURL, window.location.origin).href,
      })
      return { error: null }
    },
    async signOut() {
      await clerk.signOut()
      return { error: null }
    },
  }
}
