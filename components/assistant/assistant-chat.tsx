"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, isTextUIPart, type UIMessage } from "ai"
import { SendHorizontal } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useEffect, useState, type FormEvent } from "react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/** Concatenate a UI message's text parts (tool-call parts are not rendered in v1). */
function messageText(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("")
}

/** Which gate the server closed on us, surfaced from the response status. */
export type Gate = "premium" | "cap" | null

/** A mutable holder for the server-assigned conversation id (shared with the transport closures). */
export interface ThreadRef {
  conversationId?: string
}

/**
 * Fold an assistant API response into the chat's gate state and thread id. Captures a new
 * `X-Conversation-Id`, maps 403/429 to their gates, and — crucially — CLEARS the id on 404 so a lost
 * or expired thread doesn't get re-sent on every follow-up (which would loop on errors); the next
 * message then starts a fresh conversation.
 */
export function applyAssistantResponse(response: Response, thread: ThreadRef): Gate {
  const id = response.headers.get("X-Conversation-Id")
  if (id) thread.conversationId = id
  if (response.status === 403) return "premium"
  if (response.status === 429) return "cap"
  if (response.status === 404) thread.conversationId = undefined
  return null
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

  // A plain, stable holder (created once) for the server-assigned conversation id — not a React ref,
  // so the transport closures can read/write it without a render-time ref access.
  const [thread] = useState<{ conversationId?: string }>(() => ({}))
  const [transport] = useState(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/assistant",
        fetch: async (input, init) => {
          const response = await fetch(input, init)
          const nextGate = applyAssistantResponse(response, thread)
          if (nextGate) setGate(nextGate)
          return response
        },
        // Adapt to the route contract: send only the latest question + the running thread id.
        prepareSendMessagesRequest: ({ messages }) => {
          const last = messages.at(-1)
          return {
            body: {
              message: last ? messageText(last) : "",
              conversationId: thread.conversationId,
            },
          }
        },
      })
  )

  const { messages, sendMessage, status, error } = useChat({ transport })
  const busy = status === "submitted" || status === "streaming"

  // Gate proactively: show the upgrade CTA for a Free household without waiting for a rejected send.
  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/assistant/status", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { plan?: string } | null) => {
        if (data && data.plan !== "Premium") setGate("premium")
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  function ask(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setInput("")
    void sendMessage({ text: trimmed })
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
