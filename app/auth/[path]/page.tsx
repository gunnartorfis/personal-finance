import { AuthView } from "@neondatabase/auth-ui";

/**
 * Neon Auth catch-all UI page (ADR-0001): renders sign-in / sign-up / etc. from the path segment,
 * e.g. `/auth/sign-in`. `requireUser()` redirects here when unauthenticated.
 */
export default async function AuthPage({ params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col items-center justify-center gap-3 p-6">
      <AuthView path={path} />
    </main>
  );
}
