import { describe, expect, it } from "vitest"

import { toUiMessages } from "./ui-messages"

describe("toUiMessages", () => {
  it("maps stored rows to AI SDK UI messages with a single text part", () => {
    const out = toUiMessages([
      { id: "1", role: "user", content: "why higher?" },
      { id: "2", role: "assistant", content: "Nice to have rose." },
    ])
    expect(out).toEqual([
      { id: "1", role: "user", parts: [{ type: "text", text: "why higher?" }] },
      { id: "2", role: "assistant", parts: [{ type: "text", text: "Nice to have rose." }] },
    ])
  })

  it("returns an empty list for an empty thread", () => {
    expect(toUiMessages([])).toEqual([])
  })
})
