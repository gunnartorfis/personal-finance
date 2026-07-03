import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { redirect } from "next/navigation"

import { LandingPage } from "@/components/marketing/landing-page"
import { getCurrentUser } from "@/lib/auth/session"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing")
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  }
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
