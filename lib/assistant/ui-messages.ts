import type { UIMessage } from "ai"

/** A stored Assistant message row as returned by the thread API. */
export interface StoredMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

/**
 * Convert a persisted thread (from `GET /api/assistant/conversations/[id]`) into the AI SDK
 * `UIMessage[]` shape `useChat` renders, so selecting a past conversation rehydrates it (#101, 4c).
 */
export function toUiMessages(rows: ReadonlyArray<StoredMessage>): UIMessage[] {
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    parts: [{ type: "text", text: row.content }],
  }))
}
