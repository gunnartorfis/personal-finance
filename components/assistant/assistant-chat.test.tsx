import { fireEvent, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

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

beforeEach(() => {
  chat = {
    messages: [],
    sendMessage: vi.fn(),
    status: "ready",
    error: undefined,
  }
})

describe("AssistantChat", () => {
  it("shows the empty state with example prompts and the disclaimer", () => {
    renderWithIntl(<AssistantChat />)
    expect(screen.getByText("Ask your finances anything")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Why was March higher?" })
    ).toBeInTheDocument()
    expect(screen.getByText(/not financial advice/i)).toBeInTheDocument()
  })

  it("sends an example prompt when clicked", () => {
    renderWithIntl(<AssistantChat />)
    fireEvent.click(
      screen.getByRole("button", { name: "Top merchants this month" })
    )
    expect(chat.sendMessage).toHaveBeenCalledWith({
      text: "Top merchants this month",
    })
  })

  it("sends the typed question and clears the input", () => {
    renderWithIntl(<AssistantChat />)
    const input = screen.getByPlaceholderText(
      "Ask a question…"
    ) as HTMLInputElement
    fireEvent.change(input, { target: { value: "how much on groceries?" } })
    fireEvent.submit(input.closest("form")!)
    expect(chat.sendMessage).toHaveBeenCalledWith({
      text: "how much on groceries?",
    })
    expect(input.value).toBe("")
  })

  it("renders user and assistant turns, attributing the user's", () => {
    chat.messages = [
      { id: "1", role: "user", parts: [{ type: "text", text: "why higher?" }] },
      {
        id: "2",
        role: "assistant",
        parts: [{ type: "text", text: "Nice to have rose." }],
      },
    ]
    renderWithIntl(<AssistantChat />)
    expect(screen.getByText("why higher?")).toBeInTheDocument()
    expect(screen.getByText("Nice to have rose.")).toBeInTheDocument()
    expect(screen.getByText("You")).toBeInTheDocument()
  })

  it("disables input and send while streaming", () => {
    chat.status = "streaming"
    renderWithIntl(<AssistantChat />)
    expect(screen.getByPlaceholderText("Ask a question…")).toBeDisabled()
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled()
  })

  it("surfaces a generic error", () => {
    chat.error = new Error("boom")
    renderWithIntl(<AssistantChat />)
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again."
    )
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
