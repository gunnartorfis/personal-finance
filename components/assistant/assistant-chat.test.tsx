import { fireEvent, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderWithIntl } from "@/lib/test/render"

interface FakeChat {
  messages: Array<{
    id: string
    role: string
    parts: Array<{ type: string; text: string }>
    metadata?: { authorName: string | null }
  }>
  sendMessage: ReturnType<typeof vi.fn>
  setMessages: ReturnType<typeof vi.fn>
  status: string
  error: Error | undefined
}

let chat: FakeChat
vi.mock("@ai-sdk/react", () => ({ useChat: () => chat }))

import { AssistantChat, applyAssistantResponse } from "./assistant-chat"

interface StubOptions {
  plan?: "Premium" | "Free"
  conversations?: Array<{ id: string; title: string; updatedAt: string }>
  messages?: Array<{ id: string; role: "user" | "assistant"; content: string }>
}

/** URL-aware fetch stub covering /status, /conversations, and /conversations/[id]. */
function stubFetch({ plan = "Premium", conversations = [], messages = [] }: StubOptions = {}) {
  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string | URL) => {
      const u = String(url)
      if (u.includes("/status")) return json({ plan })
      if (/\/conversations\/[^/]+$/.test(u)) return json({ messages })
      if (u.includes("/conversations")) return json({ conversations })
      return json({})
    })
  )
}

beforeEach(() => {
  chat = {
    messages: [],
    sendMessage: vi.fn(),
    setMessages: vi.fn(),
    status: "ready",
    error: undefined,
  }
  stubFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("AssistantChat", () => {
  it("shows the empty state with example prompts and the disclaimer", async () => {
    renderWithIntl(<AssistantChat />)
    expect(await screen.findByText("Ask your finances anything")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Why was March higher?" })
    ).toBeInTheDocument()
    expect(screen.getByText(/not financial advice/i)).toBeInTheDocument()
  })

  it("sends an example prompt when clicked", async () => {
    renderWithIntl(<AssistantChat />)
    fireEvent.click(
      await screen.findByRole("button", { name: "Top merchants this month" })
    )
    expect(chat.sendMessage).toHaveBeenCalledWith(
      { text: "Top merchants this month" },
      { body: { conversationId: undefined } }
    )
  })

  it("sends the typed question and clears the input", async () => {
    renderWithIntl(<AssistantChat />)
    const input = (await screen.findByPlaceholderText(
      "Ask a question…"
    )) as HTMLInputElement
    fireEvent.change(input, { target: { value: "how much on groceries?" } })
    fireEvent.submit(input.closest("form")!)
    expect(chat.sendMessage).toHaveBeenCalledWith(
      { text: "how much on groceries?" },
      { body: { conversationId: undefined } }
    )
    expect(input.value).toBe("")
  })

  it("renders user and assistant turns, attributing the user's", async () => {
    chat.messages = [
      { id: "1", role: "user", parts: [{ type: "text", text: "why higher?" }] },
      {
        id: "2",
        role: "assistant",
        parts: [{ type: "text", text: "Nice to have rose." }],
      },
    ]
    renderWithIntl(<AssistantChat />)
    expect(await screen.findByText("why higher?")).toBeInTheDocument()
    expect(screen.getByText("Nice to have rose.")).toBeInTheDocument()
    expect(screen.getByText("You")).toBeInTheDocument()
  })

  it("attributes a history turn to its author name (metadata), not just 'You'", async () => {
    chat.messages = [
      {
        id: "1",
        role: "user",
        parts: [{ type: "text", text: "why higher?" }],
        metadata: { authorName: "Ada" },
      },
    ]
    renderWithIntl(<AssistantChat />)
    expect(await screen.findByText("Ada")).toBeInTheDocument()
    expect(screen.queryByText("You")).not.toBeInTheDocument()
  })

  it("disables input and send while streaming", async () => {
    chat.status = "streaming"
    renderWithIntl(<AssistantChat />)
    expect(await screen.findByPlaceholderText("Ask a question…")).toBeDisabled()
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled()
  })

  it("surfaces a generic error", async () => {
    chat.error = new Error("boom")
    renderWithIntl(<AssistantChat />)
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again."
    )
  })

  it("proactively shows the upgrade CTA for a Free household", async () => {
    stubFetch({ plan: "Free" })
    renderWithIntl(<AssistantChat />)
    expect(
      await screen.findByRole("link", { name: "See Premium" })
    ).toHaveAttribute("href", "/settings/billing")
    // The chat input is not rendered behind the gate.
    expect(screen.queryByPlaceholderText("Ask a question…")).not.toBeInTheDocument()
  })

  it("shows past conversations under History and loads the selected thread", async () => {
    stubFetch({
      conversations: [{ id: "c1", title: "Why was March higher?", updatedAt: "2026-03-15T00:00:00.000Z" }],
      messages: [
        { id: "1", role: "user", content: "why higher?" },
        { id: "2", role: "assistant", content: "Nice to have rose." },
      ],
    })
    renderWithIntl(<AssistantChat />)
    fireEvent.click(await screen.findByRole("button", { name: "History" }))
    fireEvent.click(await screen.findByRole("button", { name: "Why was March higher?" }))
    await vi.waitFor(() => {
      expect(chat.setMessages).toHaveBeenCalledWith([
        { id: "1", role: "user", parts: [{ type: "text", text: "why higher?" }], metadata: { authorName: null } },
        {
          id: "2",
          role: "assistant",
          parts: [{ type: "text", text: "Nice to have rose." }],
          metadata: { authorName: null },
        },
      ])
    })
  })

  it("starts a fresh thread on New chat", async () => {
    renderWithIntl(<AssistantChat />)
    fireEvent.click(await screen.findByRole("button", { name: "New chat" }))
    expect(chat.setMessages).toHaveBeenCalledWith([])
  })

  it("keeps history open (no crash) when loading a thread fails", async () => {
    const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL) => {
        const u = String(url)
        if (u.includes("/status")) return json({ plan: "Premium" })
        if (/\/conversations\/[^/]+$/.test(u)) return Promise.reject(new Error("network down"))
        if (u.includes("/conversations"))
          return json({ conversations: [{ id: "c1", title: "March", updatedAt: "2026-03-15T00:00:00.000Z" }] })
        return json({})
      })
    )
    renderWithIntl(<AssistantChat />)
    fireEvent.click(await screen.findByRole("button", { name: "History" }))
    const item = await screen.findByRole("button", { name: "March" })
    fireEvent.click(item)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/assistant/conversations/c1"))
    expect(chat.setMessages).not.toHaveBeenCalled()
    // History stays open so the member can retry.
    expect(screen.getByRole("button", { name: "March" })).toBeInTheDocument()
  })

  it("shows a thinking affordance while the request is in flight", async () => {
    chat.status = "submitted"
    renderWithIntl(<AssistantChat />)
    // findByText waits past the initial "Loading…" status until the chat (and its "Thinking…") shows.
    expect(await screen.findByText("Thinking…")).toBeInTheDocument()
  })

  it("renders the message log as an aria-live region", async () => {
    chat.messages = [{ id: "1", role: "assistant", parts: [{ type: "text", text: "hi" }] }]
    renderWithIntl(<AssistantChat />)
    const log = await screen.findByRole("log")
    expect(log).toHaveAttribute("aria-live", "polite")
  })

  it("disables the history controls while streaming (no mid-stream thread swap)", async () => {
    chat.status = "streaming"
    stubFetch({
      conversations: [{ id: "c1", title: "March", updatedAt: "2026-03-15T00:00:00.000Z" }],
    })
    renderWithIntl(<AssistantChat />)
    expect(await screen.findByRole("button", { name: "New chat" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "History" })).toBeDisabled()
  })
})

describe("applyAssistantResponse", () => {
  const response = (status: number, headers: Record<string, string> = {}) =>
    new Response(null, { status, headers })

  it("captures a new conversation id and opens no gate", () => {
    expect(applyAssistantResponse(response(200, { "X-Conversation-Id": "c1" }))).toEqual({
      gate: null,
      conversationId: "c1",
    })
  })

  it("maps 403 to premium and 429 to cap", () => {
    expect(applyAssistantResponse(response(403)).gate).toBe("premium")
    expect(applyAssistantResponse(response(429)).gate).toBe("cap")
  })

  it("signals clearing the thread on 404 so the next send starts fresh", () => {
    expect(applyAssistantResponse(response(404))).toEqual({ gate: null, clearThread: true })
  })
})
