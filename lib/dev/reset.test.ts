import { afterEach, describe, expect, it } from "vitest";

import { isDevResetEnabled } from "./reset";

describe("isDevResetEnabled", () => {
  afterEach(() => {
    delete process.env.ENABLE_DEV_RESET;
    delete process.env.VERCEL_ENV;
  });

  it("is off by default (no env set)", () => {
    expect(isDevResetEnabled()).toBe(false);
  });

  it("is on when ENABLE_DEV_RESET is opted in and not production", () => {
    process.env.ENABLE_DEV_RESET = "1";
    expect(isDevResetEnabled()).toBe(true);
    process.env.ENABLE_DEV_RESET = "true";
    expect(isDevResetEnabled()).toBe(true);
  });

  it("stays off without the flag even on a non-prod deploy", () => {
    process.env.VERCEL_ENV = "preview";
    expect(isDevResetEnabled()).toBe(false);
  });

  it("hard-refuses in production even with the flag set", () => {
    process.env.ENABLE_DEV_RESET = "1";
    process.env.VERCEL_ENV = "production";
    expect(isDevResetEnabled()).toBe(false);
  });

  it("treats non-truthy flag values as off", () => {
    process.env.ENABLE_DEV_RESET = "0";
    expect(isDevResetEnabled()).toBe(false);
    process.env.ENABLE_DEV_RESET = "yes";
    expect(isDevResetEnabled()).toBe(false);
  });
});
