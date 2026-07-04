import { describe, expect, it } from "vitest";

import { resolveActorName } from "./actor";

describe("resolveActorName", () => {
  it("prefers the display name", () => {
    expect(resolveActorName({ name: "Ada Byron", email: "ada@x.is" })).toBe("Ada Byron");
  });

  it("trims the display name", () => {
    expect(resolveActorName({ name: "  Ada  ", email: "ada@x.is" })).toBe("Ada");
  });

  it("falls back to the email when the name is blank or null", () => {
    expect(resolveActorName({ name: "   ", email: "ada@x.is" })).toBe("ada@x.is");
    expect(resolveActorName({ name: null, email: "ada@x.is" })).toBe("ada@x.is");
    expect(resolveActorName({ email: "ada@x.is" })).toBe("ada@x.is");
  });

  it("uses a constant last resort when neither name nor email is present", () => {
    expect(resolveActorName({ name: null, email: null })).toBe("Unknown member");
    expect(resolveActorName({})).toBe("Unknown member");
  });
});
