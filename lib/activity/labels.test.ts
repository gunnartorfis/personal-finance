import { describe, expect, it } from "vitest";

import { ActivityAction } from "./actions";
import { activityActionLabelKey } from "./labels";

describe("activityActionLabelKey", () => {
  it("maps every known action constant to a distinct, non-unknown key", () => {
    const keys = Object.values(ActivityAction).map(activityActionLabelKey);
    expect(keys).not.toContain("unknown");
    // Every action gets its own key (no accidental collisions).
    expect(new Set(keys).size).toBe(Object.values(ActivityAction).length);
  });

  it("maps a sample action to its camelCase catalog key", () => {
    expect(activityActionLabelKey(ActivityAction.TransactionExcluded)).toBe("transactionExcluded");
    expect(activityActionLabelKey(ActivityAction.BankDisconnected)).toBe("bankDisconnected");
  });

  it("falls back to 'unknown' for an unrecognized action", () => {
    expect(activityActionLabelKey("something.new")).toBe("unknown");
  });
});
