import { createNeonAuth } from "@neondatabase/auth/next/server";

import { authEnv, ephemeralSecret } from "./env";

/**
 * Server-side Neon Auth instance (ADR-0001).
 *
 * Backs the auth API route, route-protection middleware, and server-side session reads. Configured
 * from `NEON_AUTH_BASE_URL` (the Neon Console Auth endpoint) and `NEON_AUTH_COOKIE_SECRET`. These
 * are required at runtime; during `next build` throwaway values are used so the app compiles
 * without secrets (see `./env`). No secret is committed to the repo.
 */
export const auth = createNeonAuth({
  baseUrl: authEnv("NEON_AUTH_BASE_URL", () => "https://neon-auth.placeholder.invalid/auth"),
  cookies: {
    secret: authEnv("NEON_AUTH_COOKIE_SECRET", ephemeralSecret),
  },
});
