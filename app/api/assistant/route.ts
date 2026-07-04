import { stepCountIs, streamText } from "ai";
import { getLocale } from "next-intl/server";
import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";

import { ASSISTANT_MAX_STEPS, ASSISTANT_MODEL } from "@/lib/assistant/config";
import {
  AssistantDailyCapError,
  AssistantNotPremiumError,
  persistAssistantReply,
  prepareAssistantTurn,
} from "@/lib/assistant/turn";
import { requireHousehold } from "@/lib/household/current";
import { defaultLocale, toLocale } from "@/lib/i18n/config";

/** A tool-calling turn is several sequential gateway calls; allow the platform-max duration. */
export const maxDuration = 300;

/**
 * POST /api/assistant — answer a natural-language question about the current Household's finances by
 * streaming a Sonnet 5 tool-calling turn (#101, ADR-0018). Premium-only; soft daily cap. The user
 * message and the assistant's answer are persisted to the (household-shared) conversation; the reply
 * is written in `onFinish`. Responds in the asking Member's Locale.
 */
export async function POST(request: Request) {
  try {
    const { plan, repo, memberId } = await requireHousehold();
    const body = (await request.json().catch(() => null)) as {
      message?: unknown;
      conversationId?: unknown;
    } | null;
    const message = typeof body?.message === "string" ? body.message : "";
    const conversationId = typeof body?.conversationId === "string" ? body.conversationId : undefined;
    const locale = toLocale(await getLocale()) ?? defaultLocale;

    const turn = await prepareAssistantTurn(repo, {
      plan,
      locale,
      memberId,
      now: new Date(),
      message,
      conversationId,
    });

    const result = streamText({
      model: ASSISTANT_MODEL,
      system: turn.system,
      messages: turn.modelMessages,
      tools: turn.tools,
      stopWhen: stepCountIs(ASSISTANT_MAX_STEPS),
      // Persist the final answer once the turn completes; the user message is already saved.
      onFinish: ({ text }) => persistAssistantReply(repo, turn.conversationId, text),
    });

    const response = result.toUIMessageStreamResponse();
    // Let a new conversation's client learn its id to continue the thread.
    response.headers.set("X-Conversation-Id", turn.conversationId);
    return response;
  } catch (error) {
    // requireHousehold uses redirect()/notFound() control-flow errors Next must catch — rethrow those.
    unstable_rethrow(error);
    if (error instanceof AssistantNotPremiumError) {
      return NextResponse.json({ error: "premium_required" }, { status: 403 });
    }
    if (error instanceof AssistantDailyCapError) {
      return NextResponse.json({ error: "daily_cap_reached" }, { status: 429 });
    }
    if (error instanceof Error && error.message === "conversation_not_found") {
      return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
    }
    if (error instanceof Error && (error.message === "empty_message" || error.message === "message_too_long")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("POST /api/assistant failed", error);
    return NextResponse.json({ error: "assistant_failed" }, { status: 500 });
  }
}
