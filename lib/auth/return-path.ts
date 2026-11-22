const fallback = "/dashboard"
const base = "https://app.invalid"

/** Auth entry points accept only application-relative destinations. */
export function authReturnPath(value: string | string[] | undefined) {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback

  try {
    const url = new URL(value, base)
    if (url.origin !== base || url.pathname.startsWith("//")) return fallback
    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}
