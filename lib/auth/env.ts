/**
 * Neon Auth environment resolution (ADR-0001).
 *
 * Kept side-effect-free (no SDK construction) so it can be unit-tested. `next build` must compile
 * without secrets present (CI has none), but the running app must never start with a missing or
 * placeholder secret — so build uses a throwaway value and runtime treats a missing value as a
 * hard error. No secret is committed: the build fallback is generated per build, never a fixed literal.
 */

/** True while `next build` is compiling (Next sets this phase). */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/**
 * Read a required Neon Auth env var. Returns it when set; during a build returns `buildFallback()`
 * so compilation succeeds without secrets; otherwise throws (a running app must be configured).
 */
export function authEnv(name: string, buildFallback: () => string): string {
  const value = process.env[name];
  if (value) return value;
  if (isBuildPhase()) return buildFallback();
  throw new Error(`${name} is required — set it in the environment (or .env.local locally).`);
}

/** A random 64-hex-char value for build-time only; never a committed/known secret. */
export function ephemeralSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
