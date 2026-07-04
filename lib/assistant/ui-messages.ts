import type { UIMessage } from "ai"

/** A stored Assistant message row as returned by the thread API. */
export interface StoredMessage {
  id: string
  role: "user" | "assistant"
  content: string
  /** Display name of the asking Member (5b); null for assistant turns or a departed/unknown Member. */
  authorName?: string | null
}

/** Message metadata carried through `useChat` so a rehydrated turn can show who asked (5b). */
export interface AssistantMessageMetadata {
  authorName: string | null
}

/**
 * Convert a persisted thread (from `GET /api/assistant/conversations/[id]`) into the AI SDK
 * `UIMessage[]` shape `useChat` renders, so selecting a past conversation rehydrates it (#101, 4c).
 * The author name rides along in `metadata` so history shows who asked (5b).
 */
export function toUiMessages(rows: ReadonlyArray<StoredMessage>): UIMessage[] {
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    parts: [{ type: "text", text: row.content }],
    metadata: { authorName: row.authorName ?? null } satisfies AssistantMessageMetadata,
  }))
}
