import { createNeonAuth } from "@neondatabase/auth/next/server";

/**
 * Server-side Neon Auth instance (ADR-0001).
 *
 * Backs the auth API route, route-protection middleware, and server-side session reads. Configured
 * from `NEON_AUTH_BASE_URL` (the Neon Console Auth endpoint) and `NEON_AUTH_COOKIE_SECRET`. Build
 * placeholders keep `next build` working when the secrets are absent (CI); real values come from
 * the environment at runtime (Vercel env locally `.env.local`).
 */
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL ?? "https://neon-auth.build-placeholder.invalid/auth",
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET ?? "build-time-placeholder-cookie-secret-32chars",
  },
});
