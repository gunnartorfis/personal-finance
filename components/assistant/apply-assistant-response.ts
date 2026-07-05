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
