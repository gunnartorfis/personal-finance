import { getTranslations } from "next-intl/server"

import { AuthForm } from "@/components/auth/auth-form"
import { authReturnPath } from "@/lib/auth/return-path"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const t = await getTranslations("common")
  return { title: t("appName"), robots: { index: false, follow: false } }
}

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>
}) {
  const { redirect_url: redirectUrl } = await searchParams
  return (
    <main className="mx-auto flex min-h-svh items-center justify-center p-6">
      <AuthForm signUpPage returnTo={authReturnPath(redirectUrl)} />
    </main>
  )
}
