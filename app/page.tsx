import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { LandingPage } from "@/components/marketing/landing-page"
import { getCurrentUser } from "@/lib/auth/session"

export const metadata: Metadata = {
  title: "Finance — see where the money actually goes",
  description:
    "Upload your household’s card statements and let AI sort every transaction into Fixed, Necessary, and Nice to have — then track your real net profit, statement cycle after statement cycle.",
}

/**
 * Root route. Signed-in members go straight to the dashboard; everyone else gets the public
 * marketing page. Reading the session makes this route dynamic, which is what we want — the
 * response depends on who is asking.
 */
export default async function Page() {
  const user = await getCurrentUser()
  if (user) {
    return redirect("/dashboard")
  }
  return <LandingPage />
}
