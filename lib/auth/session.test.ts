import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Neon Auth server instance so we can assert exactly how `getSession` is invoked.
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: { getSession } }));

import { getCurrentUser } from "./session";

describe("getCurrentUser", () => {
  beforeEach(() => {
    getSession.mockReset();
    getSession.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.co", emailVerified: true } } });
  });

  it("uses the cached session by default (no cookie-cache bypass)", async () => {
    await getCurrentUser();
    expect(getSession).toHaveBeenCalledWith(undefined);
  });

  it("bypasses the cookie cache with the STRING 'true' when fresh", async () => {
    // Neon Auth's wrapper gates on a strict string compare (`disableCookieCache === "true"`); a
    // boolean would silently leave the cache on, so the exact string shape is load-bearing.
    await getCurrentUser({ fresh: true });
    expect(getSession).toHaveBeenCalledWith({ query: { disableCookieCache: "true" } });
  });

  it("returns null when there is no session", async () => {
    getSession.mockResolvedValue({ data: null });
    expect(await getCurrentUser()).toBeNull();
  });
});
