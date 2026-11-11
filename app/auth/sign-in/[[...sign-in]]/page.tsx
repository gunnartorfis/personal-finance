import { SignIn } from "@clerk/nextjs"
import { Suspense } from "react"

export const dynamic = "force-dynamic"

export default function AuthPage() {
  return (
    <main className="mx-auto flex min-h-svh items-center justify-center p-6">
      <Suspense><SignIn routing="path" path="/auth/sign-in" /></Suspense>
    </main>
  )
}
