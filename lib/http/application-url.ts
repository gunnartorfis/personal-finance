/** Public links must not inherit a container bind address or an untrusted Host header. */
export function applicationUrl(
  path: string,
  request: Request,
  env: { APP_ORIGIN?: string; NODE_ENV?: string } = process.env
): URL {
  let origin: string
  if (env.APP_ORIGIN) {
    try {
      const configured = new URL(env.APP_ORIGIN)
      if (configured.protocol !== "https:" || configured.username || configured.password ||
        configured.pathname !== "/" || configured.search || configured.hash)
        throw new Error()
      origin = configured.origin
    } catch {
      throw new Error("Configure a canonical HTTPS APP_ORIGIN")
    }
  } else {
    if (env.NODE_ENV === "production")
      throw new Error("Configure a canonical HTTPS APP_ORIGIN")
    origin = new URL(request.url).origin
  }
  const target = new URL(path, origin)
  if (!path.startsWith("/") || path.startsWith("//") || target.origin !== origin)
    throw new Error("Application links must stay on the configured origin")
  return target
}
