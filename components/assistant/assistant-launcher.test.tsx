import { fireEvent, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderWithIntl } from "@/lib/test/render"

// The launcher renders AssistantChat, which calls useChat — stub it to a ready empty chat.
vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: [],
    sendMessage: vi.fn(),
    status: "ready",
    error: undefined,
  }),
}))

import { AssistantLauncher } from "./assistant-launcher"

beforeEach(() => {
  vi.clearAllMocks()
  // The drawer mounts AssistantChat, which fetches /api/assistant/status on open.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ plan: "Premium" }), { status: 200 }))
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("AssistantLauncher", () => {
  it("renders a labelled trigger and keeps the drawer closed initially", () => {
    renderWithIntl(<AssistantLauncher />)
    expect(
      screen.getByRole("button", { name: "Ask the assistant" })
    ).toBeInTheDocument()
    expect(
      screen.queryByText("Ask about your household finances")
    ).not.toBeInTheDocument()
  })

  it("opens the drawer (with the chat) when the trigger is clicked", async () => {
    renderWithIntl(<AssistantLauncher />)
    fireEvent.click(screen.getByRole("button", { name: "Ask the assistant" }))
    expect(
      screen.getByText("Ask about your household finances")
    ).toBeInTheDocument()
    // The chat's empty state appears once the plan-status probe resolves.
    expect(await screen.findByText("Ask your finances anything")).toBeInTheDocument()
  })

  it("toggles the drawer with the ⌘K / Ctrl-K shortcut", () => {
    renderWithIntl(<AssistantLauncher />)
    fireEvent.keyDown(window, { key: "k", metaKey: true })
    expect(
      screen.getByText("Ask about your household finances")
    ).toBeInTheDocument()
    fireEvent.keyDown(window, { key: "k", metaKey: true })
    expect(
      screen.queryByText("Ask about your household finances")
    ).not.toBeInTheDocument()
  })
})
