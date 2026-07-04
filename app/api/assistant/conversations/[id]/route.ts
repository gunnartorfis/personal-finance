import { unstable_rethrow } from "next/navigation"
import { NextResponse } from "next/server"

import { getDb } from "@/lib/db"
import { requireHousehold } from "@/lib/household/current"
import { listMembersWithIdentity } from "@/lib/household/members-view"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/assistant/conversations/[id] — one thread's messages, oldest-first, for rehydrating a
 * past conversation in the drawer (#101, slice 4c). Tenant-scoped: a thread outside the Household
 * (or a malformed id) is 404, never a cross-tenant read or a DB error.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { repo, householdId } = await requireHousehold()
    const { id } = await params
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "conversation_not_found" }, { status: 404 })
    }
    const conversation = await repo.assistant.getConversation(id)
    if (!conversation) {
      return NextResponse.json({ error: "conversation_not_found" }, { status: 404 })
    }
    const [messages, members] = await Promise.all([
      repo.assistant.listMessages(id),
      listMembersWithIdentity(getDb(), householdId),
    ])
    // Resolve each user turn's author to a display name (5b); assistant turns + departed/unknown
    // members resolve to null and render generically.
    const nameByMember = new Map(members.map((member) => [member.id, member.name]))
    return NextResponse.json({
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        authorName: message.memberId ? (nameByMember.get(message.memberId) ?? null) : null,
      })),
    })
  } catch (error) {
    unstable_rethrow(error)
    console.error("GET /api/assistant/conversations/[id] failed", error)
    return NextResponse.json({ error: "conversation_failed" }, { status: 500 })
  }
}
