import { beforeEach, describe, expect, it, vi } from "vitest";

const requireHousehold = vi.fn();
vi.mock("@/lib/household/current", () => ({ requireHousehold: () => requireHousehold() }));

vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));

// Keep the real error classes + persistAssistantReply; stub only prepareAssistantTurn.
const prepareAssistantTurn = vi.fn();
const persistAssistantReply = vi.fn();
vi.mock("@/lib/assistant/turn", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/assistant/turn")>();
  return {
    ...actual,
    prepareAssistantTurn: (...a: unknown[]) => prepareAssistantTurn(...a),
    persistAssistantReply: (...a: unknown[]) => persistAssistantReply(...a),
  };
});

// Stub the streaming call; capture its options so we can assert wiring.
const streamText = vi.fn<(...args: unknown[]) => { toUIMessageStreamResponse: () => Response }>(() => ({
  toUIMessageStreamResponse: () => new Response("stream", { headers: new Headers() }),
}));
vi.mock("ai", async (importActual) => {
  const actual = await importActual<typeof import("ai")>();
  return { ...actual, streamText: (...a: unknown[]) => streamText(...a) };
});

import { AssistantDailyCapError, AssistantNotPremiumError } from "@/lib/assistant/turn";

import { POST } from "./route";

const postReq = (body: unknown) =>
  new Request("https://app.example.com/api/assistant", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  requireHousehold.mockReset();
  prepareAssistantTurn.mockReset();
  persistAssistantReply.mockReset();
  streamText.mockClear();
  requireHousehold.mockResolvedValue({ plan: "Premium", repo: {}, memberId: "m1" });
});

describe("POST /api/assistant", () => {
  it("403s a non-Premium household", async () => {
    prepareAssistantTurn.mockRejectedValue(new AssistantNotPremiumError());
    const res = await POST(postReq({ message: "hi" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "premium_required" });
  });

  it("429s when the daily cap is reached", async () => {
    prepareAssistantTurn.mockRejectedValue(new AssistantDailyCapError());
    const res = await POST(postReq({ message: "hi" }));
    expect(res.status).toBe(429);
  });

  it("400s an empty message", async () => {
    prepareAssistantTurn.mockRejectedValue(new Error("empty_message"));
    const res = await POST(postReq({ message: "" }));
    expect(res.status).toBe(400);
  });

  it("404s an unknown conversation", async () => {
    prepareAssistantTurn.mockRejectedValue(new Error("conversation_not_found"));
    const res = await POST(postReq({ message: "hi", conversationId: "x" }));
    expect(res.status).toBe(404);
  });

  it("streams the turn and returns the conversation id header on success", async () => {
    prepareAssistantTurn.mockResolvedValue({
      conversationId: "conv-1",
      system: "sys",
      modelMessages: [{ role: "user", content: "hi" }],
      tools: { getCycleSummary: {} },
    });
    const res = await POST(postReq({ message: "hi" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Conversation-Id")).toBe("conv-1");
    expect(streamText).toHaveBeenCalledOnce();
    const opts = streamText.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.system).toBe("sys");
    expect(opts.stopWhen).toBeDefined();
    expect(typeof opts.onFinish).toBe("function");
  });

  it("swallows (does not rethrow) a persistence failure in onFinish", async () => {
    prepareAssistantTurn.mockResolvedValue({
      conversationId: "conv-1",
      system: "sys",
      modelMessages: [],
      tools: {},
    });
    persistAssistantReply.mockRejectedValue(new Error("db down"));
    await POST(postReq({ message: "hi" }));
    const opts = streamText.mock.calls[0][0] as { onFinish: (e: { text: string }) => Promise<void> };
    // The AI SDK awaits onFinish and does not catch it — our wrapper must resolve, not reject.
    await expect(opts.onFinish({ text: "answer" })).resolves.toBeUndefined();
    expect(persistAssistantReply).toHaveBeenCalledWith({}, "conv-1", "answer");
  });
});
