import { afterEach, describe, expect, it } from "vitest";

import { isHouseholdResetEnabled } from "./reset-availability";

describe("isHouseholdResetEnabled", () => {
  afterEach(() => {
    delete process.env.ENABLE_HOUSEHOLD_RESET;
    delete process.env.VERCEL_ENV;
  });

  it("is off by default (no env set)", () => {
    expect(isHouseholdResetEnabled()).toBe(false);
  });

  it("is on when ENABLE_HOUSEHOLD_RESET is opted in", () => {
    process.env.ENABLE_HOUSEHOLD_RESET = "1";
    expect(isHouseholdResetEnabled()).toBe(true);
    process.env.ENABLE_HOUSEHOLD_RESET = "true";
    expect(isHouseholdResetEnabled()).toBe(true);
  });

  it("stays off without the flag regardless of deploy type", () => {
    process.env.VERCEL_ENV = "preview";
    expect(isHouseholdResetEnabled()).toBe(false);
  });

  it("follows the flag even in production (env is the single source of truth)", () => {
    process.env.ENABLE_HOUSEHOLD_RESET = "1";
    process.env.VERCEL_ENV = "production";
    expect(isHouseholdResetEnabled()).toBe(true);
  });

  it("treats non-truthy flag values as off", () => {
    process.env.ENABLE_HOUSEHOLD_RESET = "0";
    expect(isHouseholdResetEnabled()).toBe(false);
    process.env.ENABLE_HOUSEHOLD_RESET = "yes";
    expect(isHouseholdResetEnabled()).toBe(false);
  });
});
