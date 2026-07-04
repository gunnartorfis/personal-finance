import { fireEvent, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderWithIntl } from "@/lib/test/render"

interface FakeChat {
  messages: Array<{
    id: string
    role: string
    parts: Array<{ type: string; text: string }>
  }>
  sendMessage: ReturnType<typeof vi.fn>
  status: string
  error: Error | undefined
}

let chat: FakeChat
vi.mock("@ai-sdk/react", () => ({ useChat: () => chat }))

import { AssistantChat, applyAssistantResponse, type ThreadRef } from "./assistant-chat"

/** Stub the status fetch (component gates proactively on mount). Default: a Premium household. */
function stubStatus(plan: "Premium" | "Free") {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ plan }), { status: 200 }))
  )
}

beforeEach(() => {
  chat = {
    messages: [],
    sendMessage: vi.fn(),
    status: "ready",
    error: undefined,
  }
  stubStatus("Premium")
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
    expect(chat.sendMessage).toHaveBeenCalledWith({
      text: "Top merchants this month",
    })
  })

  it("sends the typed question and clears the input", async () => {
    renderWithIntl(<AssistantChat />)
    const input = (await screen.findByPlaceholderText(
      "Ask a question…"
    )) as HTMLInputElement
    fireEvent.change(input, { target: { value: "how much on groceries?" } })
    fireEvent.submit(input.closest("form")!)
    expect(chat.sendMessage).toHaveBeenCalledWith({
      text: "how much on groceries?",
    })
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
    stubStatus("Free")
    renderWithIntl(<AssistantChat />)
    expect(
      await screen.findByRole("link", { name: "See Premium" })
    ).toHaveAttribute("href", "/settings/billing")
    // The chat input is not rendered behind the gate.
    expect(screen.queryByPlaceholderText("Ask a question…")).not.toBeInTheDocument()
  })
})

describe("applyAssistantResponse", () => {
  const response = (status: number, headers: Record<string, string> = {}) =>
    new Response(null, { status, headers })

  it("captures a new conversation id and opens no gate", () => {
    const thread: ThreadRef = {}
    expect(applyAssistantResponse(response(200, { "X-Conversation-Id": "c1" }), thread)).toBeNull()
    expect(thread.conversationId).toBe("c1")
  })

  it("maps 403 to premium and 429 to cap", () => {
    expect(applyAssistantResponse(response(403), {})).toBe("premium")
    expect(applyAssistantResponse(response(429), {})).toBe("cap")
  })

  it("clears a stale conversation id on 404 so the next send starts fresh", () => {
    const thread: ThreadRef = { conversationId: "dead" }
    expect(applyAssistantResponse(response(404), thread)).toBeNull()
    expect(thread.conversationId).toBeUndefined()
  })
})
