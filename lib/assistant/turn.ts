import type { HouseholdRepo } from "@/lib/db/household-repo";
import type { Locale } from "@/lib/i18n/config";
import type { Plan } from "@/shared/types";

import { toAiTools } from "./ai-tools";
import { assistantDailyCapReached } from "./rate-limit";
import { buildAssistantSystemPrompt } from "./system-prompt";
import type { AssistantToolContext } from "./tools/types";

/** Non-Premium household tried to use the Assistant → 403. */
export class AssistantNotPremiumError extends Error {
  constructor() {
    super("premium_required");
    this.name = "AssistantNotPremiumError";
  }
}

/** Household hit its soft daily message cap → 429. */
export class AssistantDailyCapError extends Error {
  constructor() {
    super("daily_cap_reached");
    this.name = "AssistantDailyCapError";
  }
}

const MAX_TITLE = 80;
/** Longest user message we accept — a question, not a document (also under the 10k content CHECK). */
export const MAX_MESSAGE = 2000;

/** A short conversation title from the first question: whitespace collapsed, truncated with an ellipsis. */
export function deriveTitle(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  return trimmed.length <= MAX_TITLE ? trimmed : `${trimmed.slice(0, MAX_TITLE - 1).trimEnd()}…`;
}

/** A model-ready chat message (role + text) reconstructed from a stored thread. */
export interface AssistantModelMessage {
  role: "user" | "assistant";
  content: string;
}

/** Everything the route needs to call `streamText`, after guards + persistence. */
export interface PreparedTurn {
  conversationId: string;
  system: string;
  modelMessages: AssistantModelMessage[];
  tools: ReturnType<typeof toAiTools>;
}

export interface PrepareTurnInput {
  plan: Plan;
  locale: Locale;
  memberId: string;
  now: Date;
  message: string;
  /** Continue an existing thread; omit to start a new one. */
  conversationId?: string;
  /** Daily-cap override (tests); defaults to the configured cap. */
  cap?: number;
}

/**
 * Guard, persist, and assemble one Assistant turn (#101, ADR-0018). Enforces the Premium gate and the
 * daily cap, resolves or creates the (household-shared) conversation, persists the user message, and
 * returns the system prompt + full-thread model messages + tenant-scoped tools for `streamText`. The
 * DB read/write layer is here (testable); only the streaming call itself lives in the route.
 */
export async function prepareAssistantTurn(
  repo: HouseholdRepo,
  input: PrepareTurnInput,
): Promise<PreparedTurn> {
  if (input.plan !== "Premium") throw new AssistantNotPremiumError();
  if (await assistantDailyCapReached(repo, input.now, input.cap)) throw new AssistantDailyCapError();

  const message = input.message.trim();
  if (!message) throw new Error("empty_message");
  if (message.length > MAX_MESSAGE) throw new Error("message_too_long");

  let conversationId = input.conversationId;
  if (conversationId) {
    const existing = await repo.assistant.getConversation(conversationId);
    if (!existing) throw new Error("conversation_not_found");
  } else {
    const conv = await repo.assistant.createConversation({
      startedByMemberId: input.memberId,
      title: deriveTitle(message),
    });
    conversationId = conv.id;
  }

  await repo.assistant.appendMessage({ conversationId, memberId: input.memberId, role: "user", content: message });
  const thread = await repo.assistant.listMessages(conversationId);

  const ctx: AssistantToolContext = { repo, now: input.now };
  return {
    conversationId,
    system: buildAssistantSystemPrompt({ locale: input.locale, now: input.now }),
    modelMessages: thread.map((m) => ({ role: m.role, content: m.content })),
    tools: toAiTools(ctx),
  };
}

/** Content CHECK upper bound (schema): assistant text is clamped to this on persist. */
const MAX_CONTENT = 10_000;

/** Persist the assistant's final answer (streamText `onFinish`), unattributed. No-op on empty text. */
export async function persistAssistantReply(
  repo: HouseholdRepo,
  conversationId: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  await repo.assistant.appendMessage({
    conversationId,
    memberId: null,
    role: "assistant",
    content: trimmed.slice(0, MAX_CONTENT),
  });
}
