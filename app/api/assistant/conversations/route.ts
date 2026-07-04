import { unstable_rethrow } from "next/navigation"
import { NextResponse } from "next/server"

import { requireHousehold } from "@/lib/household/current"

/**
 * GET /api/assistant/conversations — the Household's Assistant threads, newest-activity first (#101,
 * slice 4c). Household-shared, so every Member sees the whole list.
 */
export async function GET() {
  try {
    const { repo } = await requireHousehold()
    const conversations = await repo.assistant.listConversations()
    return NextResponse.json({
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
      })),
    })
  } catch (error) {
    unstable_rethrow(error)
    console.error("GET /api/assistant/conversations failed", error)
    return NextResponse.json({ error: "conversations_failed" }, { status: 500 })
  }
}
