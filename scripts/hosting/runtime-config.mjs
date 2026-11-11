const required = ["DATABASE_URL", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"]

/** Return names only: URLs, provider keys and thrown URL errors must never enter logs. */
export function invalidRuntimeConfiguration(env) {
  const invalid = new Set(required.filter((name) =>
    !env[name]?.trim() || env[name].includes("[SENSITIVE]")
  ))
  try {
    if (!["postgres:", "postgresql:"].includes(new URL(env.DATABASE_URL).protocol))
      invalid.add("DATABASE_URL")
  } catch { invalid.add("DATABASE_URL") }
  if (env.NODE_ENV === "production" || env.APP_ORIGIN) {
    try {
      const origin = new URL(env.APP_ORIGIN ?? "")
      if (origin.protocol !== "https:" || origin.username || origin.password ||
        origin.pathname !== "/" || origin.search || origin.hash)
        invalid.add("APP_ORIGIN")
    } catch { invalid.add("APP_ORIGIN") }
  }
  const publicMode = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.match(/^pk_(test|live)_[A-Za-z0-9+/=_-]+$/)?.[1]
  const secretMode = env.CLERK_SECRET_KEY?.match(/^sk_(test|live)_[A-Za-z0-9_-]+$/)?.[1]
  if (!publicMode) invalid.add("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")
  if (!secretMode) invalid.add("CLERK_SECRET_KEY")
  if (publicMode && secretMode && publicMode !== secretMode) {
    invalid.add("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")
    invalid.add("CLERK_SECRET_KEY")
  }
  // Optional providers may be disabled, but a configured placeholder is never a credential.
  for (const name of ["CRON_SECRET", "ENABLE_BANKING_PRIVATE_KEY", "AI_GATEWAY_API_KEY",
    "STRAUMUR_API_KEY", "STRAUMUR_WEBHOOK_HMAC_KEY", "STRAUMUR_TERMINAL_IDENTIFIER",
    "RESEND_API_KEY", "DIGEST_UNSUBSCRIBE_SECRET"]) {
    if (env[name]?.includes("[SENSITIVE]")) invalid.add(name)
  }
  return [...invalid].sort()
}
