import { afterEach, describe, expect, it } from "vitest";

import { authEnv, ephemeralSecret } from "./env";

const NAME = "TEST_NEON_AUTH_VAR";

describe("authEnv", () => {
  afterEach(() => {
    delete process.env[NAME];
    delete process.env.NEXT_PHASE;
  });

  it("returns the value when the variable is set", () => {
    process.env[NAME] = "real-value";
    expect(authEnv(NAME, () => "fallback")).toBe("real-value");
  });

  it("uses the build fallback during next build when unset", () => {
    process.env.NEXT_PHASE = "phase-production-build";
    expect(authEnv(NAME, () => "build-only")).toBe("build-only");
  });

  it("throws at runtime when the variable is missing", () => {
    expect(() => authEnv(NAME, () => "build-only")).toThrow(/required/);
  });
});

describe("ephemeralSecret", () => {
  it("is 64 hex characters and differs each call", () => {
    const a = ephemeralSecret();
    const b = ephemeralSecret();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});
