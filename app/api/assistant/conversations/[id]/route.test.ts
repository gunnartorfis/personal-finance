import { beforeEach, describe, expect, it, vi } from "vitest"

const requireHousehold = vi.fn()
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }))

import { GET } from "./route"

const UUID = "11111111-1111-1111-1111-111111111111"
const call = (id: string) =>
  GET(new Request(`https://app.example.com/api/assistant/conversations/${id}`), {
    params: Promise.resolve({ id }),
  })

beforeEach(() => {
  requireHousehold.mockReset()
})

describe("GET /api/assistant/conversations/[id]", () => {
  it("404s a malformed id without querying", async () => {
    const getConversation = vi.fn()
    requireHousehold.mockResolvedValue({ repo: { assistant: { getConversation } } })
    const res = await call("not-a-uuid")
    expect(res.status).toBe(404)
    expect(getConversation).not.toHaveBeenCalled()
  })

  it("404s a thread outside the household", async () => {
    requireHousehold.mockResolvedValue({
      repo: { assistant: { getConversation: vi.fn().mockResolvedValue(undefined) } },
    })
    expect((await call(UUID)).status).toBe(404)
  })

  it("returns the thread's messages, oldest-first, trimmed", async () => {
    requireHousehold.mockResolvedValue({
      repo: {
        assistant: {
          getConversation: vi.fn().mockResolvedValue({ id: UUID }),
          listMessages: vi.fn().mockResolvedValue([
            { id: "1", role: "user", content: "why higher?", memberId: "m1", householdId: "h" },
            { id: "2", role: "assistant", content: "Nice to have rose.", memberId: null, householdId: "h" },
          ]),
        },
      },
    })
    const res = await call(UUID)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      messages: [
        { id: "1", role: "user", content: "why higher?" },
        { id: "2", role: "assistant", content: "Nice to have rose." },
      ],
    })
  })
})
