import { SignIn } from "@clerk/nextjs"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const t = await getTranslations("common")
  return { title: t("appName"), robots: { index: false, follow: false } }
}

export default function AuthPage() {
  return (
    <main className="mx-auto flex min-h-svh items-center justify-center p-6">
      <Suspense><SignIn routing="path" path="/auth/sign-in" /></Suspense>
    </main>
  )
}
