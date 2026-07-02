import { describe, expect, it } from "vitest";

import { reconnectPrompts, reconnectReason, type ConnectionStatusInput } from "./reconnect";

const NOW = new Date("2026-07-01T00:00:00Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const conn = (o: Partial<ConnectionStatusInput> = {}): ConnectionStatusInput => ({
  id: "c1",
  institutionName: "Landsbankinn",
  status: "active",
  consentExpiresAt: inDays(60),
  ...o,
});

describe("reconnectReason", () => {
  it("flags a connection whose last sync errored", () => {
    expect(reconnectReason(conn({ status: "error" }), NOW)).toBe("error");
  });

  it("flags consent that has already expired (by date)", () => {
    expect(reconnectReason(conn({ consentExpiresAt: inDays(-1) }), NOW)).toBe("expired");
  });

  it("flags consent expiring within the grace window", () => {
    expect(reconnectReason(conn({ consentExpiresAt: inDays(3) }), NOW)).toBe("expiring");
  });

  it("honors a stored expired/expiring status even without a date", () => {
    expect(reconnectReason(conn({ status: "expired", consentExpiresAt: null }), NOW)).toBe("expired");
    expect(reconnectReason(conn({ status: "expiring", consentExpiresAt: null }), NOW)).toBe("expiring");
  });

  it("leaves a healthy active connection alone", () => {
    expect(reconnectReason(conn(), NOW)).toBeNull();
  });

  it("never prompts to reconnect a revoked connection", () => {
    expect(reconnectReason(conn({ status: "revoked", consentExpiresAt: inDays(-1) }), NOW)).toBeNull();
  });
});

describe("reconnectPrompts", () => {
  it("keeps only connections needing reconnect and carries their bank + reason", () => {
    const prompts = reconnectPrompts(
      [
        conn({ id: "ok" }),
        conn({ id: "bad", status: "error", institutionName: "Arion" }),
        conn({ id: "gone", status: "revoked", consentExpiresAt: inDays(-5) }),
      ],
      NOW,
    );
    expect(prompts).toEqual([{ id: "bad", institutionName: "Arion", reason: "error" }]);
  });

  it("skips a connection with no institution name — reconnect has nothing to hand the aggregator", () => {
    expect(reconnectPrompts([conn({ status: "error", institutionName: null })], NOW)).toEqual([]);
  });
});
