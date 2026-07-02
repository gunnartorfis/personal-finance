import { describe, expect, it } from "vitest";

import { buildConnectionViews } from "./connections-view";

describe("buildConnectionViews", () => {
  it("groups each connection with its synced accounts and ignores manual accounts", () => {
    const views = buildConnectionViews(
      [
        { id: "c1", institutionName: "Landsbankinn", status: "active" },
        { id: "c2", institutionName: "Arion", status: "error" },
      ],
      [
        { id: "a1", name: "Debit", connectionId: "c1" },
        { id: "a2", name: "Savings", connectionId: "c1" },
        { id: "a3", name: "Credit", connectionId: "c2" },
        { id: "m1", name: "Manual card", connectionId: null },
      ],
    );

    expect(views).toEqual([
      {
        id: "c1",
        institutionName: "Landsbankinn",
        status: "active",
        isDisconnected: false,
        accounts: [
          { id: "a1", name: "Debit" },
          { id: "a2", name: "Savings" },
        ],
      },
      {
        id: "c2",
        institutionName: "Arion",
        status: "error",
        isDisconnected: false,
        accounts: [{ id: "a3", name: "Credit" }],
      },
    ]);
  });

  it("flags a revoked connection as disconnected and falls back to a generic name", () => {
    const [view] = buildConnectionViews(
      [{ id: "c1", institutionName: null, status: "revoked" }],
      [],
    );
    expect(view.isDisconnected).toBe(true);
    expect(view.institutionName).toBe("Bank connection");
    expect(view.accounts).toEqual([]);
  });
});
