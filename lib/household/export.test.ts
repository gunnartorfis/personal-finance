import { describe, expect, it } from "vitest";

import { buildHouseholdExport, type HouseholdExportInput } from "./export";

function emptyInput(): HouseholdExportInput {
  return {
    accounts: [],
    balances: [],
    uploads: [],
    transactions: [],
    overrides: [],
    merchantRules: [],
    bankConnections: [],
    savings: { goal: undefined, incomeSources: [], offcardCosts: [], oneOffAdjustments: [] },
    budgets: [],
  };
}

describe("buildHouseholdExport", () => {
  it("strips encrypted bank tokens but keeps the rest of the connection", () => {
    const input = emptyInput();
    input.bankConnections = [
      {
        id: "c1",
        householdId: "h1",
        provider: "enable_banking",
        providerConnectionId: "conn-1",
        institutionId: "LANDSBANKINN",
        institutionName: "Landsbankinn",
        status: "active",
        consentExpiresAt: null,
        accessToken: "SECRET-ACCESS",
        refreshToken: "SECRET-REFRESH",
        lastSyncedAt: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ];

    const [connection] = buildHouseholdExport(input).bankConnections;
    expect(connection).not.toHaveProperty("accessToken");
    expect(connection).not.toHaveProperty("refreshToken");
    expect(connection).toMatchObject({ id: "c1", provider: "enable_banking", institutionName: "Landsbankinn" });
    // Belt and suspenders: the serialized export must not contain the secret values anywhere.
    expect(JSON.stringify(buildHouseholdExport(input))).not.toContain("SECRET");
  });

  it("passes every other section through unchanged", () => {
    const input = emptyInput();
    input.budgets = [
      { id: "b1", householdId: "h1", expenseType: "Fixed", monthlyAmount: 200_000, createdAt: new Date("2026-01-01T00:00:00Z") },
    ];
    input.savings.goal = undefined;
    const out = buildHouseholdExport(input);
    expect(out.budgets).toBe(input.budgets);
    expect(out.savings).toEqual(input.savings);
  });
});
