"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, isTextUIPart, type UIMessage } from "ai"
import { SendHorizontal } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useEffect, useState, type FormEvent } from "react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toUiMessages } from "@/lib/assistant/ui-messages"
import { cn } from "@/lib/utils"

/** One past thread in the history list. */
interface ConversationSummary {
  id: string
  title: string
  updatedAt: string
}

/** Concatenate a UI message's text parts (tool-call parts are not rendered in v1). */
function messageText(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("")
}

/** Which gate the server closed on us, surfaced from the response status. */
export type Gate = "premium" | "cap" | null

/** What an assistant API response tells the chat to do next (pure — the component applies it to state). */
export interface ResponseOutcome {
  gate: Gate
  /** A newly-assigned conversation id from `X-Conversation-Id`, to adopt for follow-ups. */
  conversationId?: string
  /** Whether to drop the current thread id (404 — lost/expired) so the next send starts fresh. */
  clearThread?: boolean
}

/**
 * Read an assistant API response into an outcome: capture a new `X-Conversation-Id`, map 403/429 to
 * their gates, and — crucially — on 404 signal to CLEAR the thread id so a lost/expired conversation
 * isn't re-sent on every follow-up (which would loop on errors); the next message then starts fresh.
 */
export function applyAssistantResponse(response: Response): ResponseOutcome {
  const id = response.headers.get("X-Conversation-Id")
  const outcome: ResponseOutcome = { gate: null }
  if (id) outcome.conversationId = id
  if (response.status === 403) outcome.gate = "premium"
  else if (response.status === 429) outcome.gate = "cap"
  else if (response.status === 404) outcome.clearThread = true
  return outcome
}

/**
 * The Assistant chat (#101, slice 4a): a single active thread wired to `POST /api/assistant` via
 * `useChat`. The transport adapts `useChat`'s message list to the route's `{ message, conversationId }`
 * body and captures the `X-Conversation-Id` header so follow-ups continue the same thread. Premium
 * (403) and daily-cap (429) are surfaced reactively from the response status. Conversation history /
 * thread switching is slice 4b.
 */
export function AssistantChat() {
  const t = useTranslations("assistant")
  const [gate, setGate] = useState<Gate>(null)
  const [input, setInput] = useState("")
  // Hold the chat until the plan is known, so a Free member never sees the input flash before the
  // upgrade gate resolves.
  const [ready, setReady] = useState(false)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [showHistory, setShowHistory] = useState(false)
  // The active server thread id, adopted from X-Conversation-Id / a selected thread and passed on the
  // next send. Kept in state (not a ref) so it plays cleanly with the React Compiler.
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)

  const [transport] = useState(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/assistant",
        fetch: async (input, init) => {
          const response = await fetch(input, init)
          const outcome = applyAssistantResponse(response)
          if (outcome.conversationId) setConversationId(outcome.conversationId)
          if (outcome.clearThread) setConversationId(undefined)
          if (outcome.gate) setGate(outcome.gate)
          return response
        },
        // Adapt to the route contract: send only the latest question + the thread id, which the send
        // call passes through `body` (below) so this closure needs no mutable state of its own.
        prepareSendMessagesRequest: ({ messages, body }) => {
          const last = messages.at(-1)
          return {
            body: {
              message: last ? messageText(last) : "",
              conversationId: (body as { conversationId?: string } | undefined)?.conversationId,
            },
          }
        },
      })
  )

  const { messages, sendMessage, setMessages, status, error } = useChat({ transport })
  const busy = status === "submitted" || status === "streaming"

  // Load the Household's past threads for the history list (harmless for Free: it just returns none).
  useEffect(() => {
    let cancelled = false
    fetch("/api/assistant/conversations")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { conversations?: ConversationSummary[] } | null) => {
        if (!cancelled && data?.conversations) setConversations(data.conversations)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  /** Rehydrate a past thread into the chat and continue it. */
  async function openThread(id: string) {
    // Never swap the message list mid-stream — it would splice the new tokens onto the old thread.
    if (busy) return
    setShowHistory(false)
    const response = await fetch(`/api/assistant/conversations/${id}`)
    if (!response.ok) return
    const data = (await response.json()) as { messages: Array<{ id: string; role: "user" | "assistant"; content: string }> }
    setMessages(toUiMessages(data.messages))
    setConversationId(id)
    setGate(null)
  }

  /** Start a fresh conversation (the next send creates a new server thread). */
  function newChat() {
    if (busy) return
    setMessages([])
    setConversationId(undefined)
    setShowHistory(false)
  }

  // Gate proactively: show the upgrade CTA for a Free household without waiting for a rejected send.
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    fetch("/api/assistant/status", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { plan?: string } | null) => {
        if (!cancelled && data && data.plan !== "Premium") setGate("premium")
      })
      // Fail open on a status error: the streaming route's 403 is the authoritative gate, so a failed
      // status probe just lets the member try — a Free send is still rejected + shows the upgrade.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  function ask(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setShowHistory(false)
    setInput("")
    // Pass the active thread id through per-send `body`; the transport forwards it to the route.
    void sendMessage({ text: trimmed }, { body: { conversationId } })
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    ask(input)
  }

  if (gate === "premium") {
    return (
      <AssistantNotice title={t("upgrade.title")} body={t("upgrade.body")}>
        <Link
          href="/settings/billing"
          className={cn(buttonVariants({ size: "sm" }))}
        >
          {t("upgrade.cta")}
        </Link>
      </AssistantNotice>
    )
  }
  if (gate === "cap")
    return <AssistantNotice title={t("cap.title")} body={t("cap.body")} />
  if (!ready)
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-6">
        <p className="text-sm text-muted-foreground" role="status">
          {t("loading")}
        </p>
      </div>
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <Button variant="ghost" size="sm" onClick={newChat} disabled={busy}>
          {t("newChat")}
        </Button>
        {conversations.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={showHistory}
            onClick={() => setShowHistory((previous) => !previous)}
            disabled={busy}
          >
            {t("history")}
          </Button>
        ) : null}
      </div>

      {showHistory ? (
        <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto py-1" role="list">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                onClick={() => openThread(conversation.id)}
                className={cn(
                  "w-full truncate px-4 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                )}
              >
                {conversation.title}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          {messages.length === 0 ? (
            <EmptyState onPick={ask} />
          ) : (
            messages.map((message) => (
              <Bubble key={message.id} role={message.role} you={t("you")}>
                {messageText(message)}
              </Bubble>
            ))
          )}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {t("error.generic")}
            </p>
          ) : null}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 border-t px-4 py-3"
      >
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          disabled={busy}
          autoComplete="off"
        />
        <Button
          type="submit"
          size="icon"
          aria-label={t("send")}
          disabled={busy || input.trim().length === 0}
        >
          <SendHorizontal />
        </Button>
      </form>

      <p className="border-t px-4 py-2 text-xs text-muted-foreground">
        {t("disclaimer")}
      </p>
    </div>
  )
}

/** One chat turn. User turns are attributed and right-aligned; the assistant is left-aligned. */
function Bubble({
  role,
  you,
  children,
}: {
  role: string
  you: string
  children: string
}) {
  const isUser = role === "user"
  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        isUser ? "items-end" : "items-start"
      )}
    >
      {isUser ? (
        <span className="text-xs text-muted-foreground">{you}</span>
      ) : null}
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {children}
      </div>
    </div>
  )
}

/** Empty state with a few one-tap example questions. */
function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  const t = useTranslations("assistant")
  const prompts = [t("empty.march"), t("empty.merchants"), t("empty.goal")]
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-3 py-6">
      <p className="text-sm font-medium">{t("empty.heading")}</p>
      <p className="text-xs text-muted-foreground">{t("empty.hint")}</p>
      <div className="flex flex-col items-start gap-2">
        {prompts.map((prompt) => (
          <Button
            key={prompt}
            variant="outline"
            size="sm"
            onClick={() => onPick(prompt)}
          >
            {prompt}
          </Button>
        ))}
      </div>
    </div>
  )
}

/** A full-panel message (premium gate / daily cap), with an optional action. */
function AssistantNotice({
  title,
  body,
  children,
}: {
  title: string
  body: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-3 px-4 py-6">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
      {children}
    </div>
  )
}
