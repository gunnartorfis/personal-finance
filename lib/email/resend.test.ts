import { describe, expect, it, vi } from "vitest"

import { createResendSender, type SendEmailParams } from "./resend"

const params: SendEmailParams = {
  from: "Auratal <no-reply@auratal.is>",
  to: "member@example.com",
  subject: "Your March 2026 summary",
  html: "<p>hi</p>",
}

/** A typed fetch stub returning the given status + JSON body (typed so `.mock.calls` are inspectable). */
function fakeFetch(status: number, body: unknown) {
  return vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status }),
  )
}

describe("createResendSender", () => {
  it("POSTs to the Resend emails endpoint with bearer auth and JSON", async () => {
    const fetchImpl = fakeFetch(200, { id: "email_1" })
    await createResendSender("re_test_key", fetchImpl as unknown as typeof fetch).send(params)

    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe("https://api.resend.com/emails")
    expect(init.method).toBe("POST")
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer re_test_key")
    expect(headers["Content-Type"]).toBe("application/json")
  })

  it("sends from/to/subject/html in the body (to as an array)", async () => {
    const fetchImpl = fakeFetch(200, { id: "email_1" })
    await createResendSender("re_k", fetchImpl as unknown as typeof fetch).send(params)
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string)
    expect(body).toMatchObject({
      from: "Auratal <no-reply@auratal.is>",
      to: ["member@example.com"],
      subject: "Your March 2026 summary",
      html: "<p>hi</p>",
    })
  })

  it("passes reply_to and custom headers when provided", async () => {
    const fetchImpl = fakeFetch(200, { id: "email_1" })
    await createResendSender("re_k", fetchImpl as unknown as typeof fetch).send({
      ...params,
      replyTo: "hello@auratal.is",
      headers: { "List-Unsubscribe": "<https://auratal.is/u>" },
    })
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string)
    expect(body.reply_to).toBe("hello@auratal.is")
    expect(body.headers).toEqual({ "List-Unsubscribe": "<https://auratal.is/u>" })
  })

  it("returns the message id on success", async () => {
    const fetchImpl = fakeFetch(200, { id: "email_abc" })
    const result = await createResendSender("re_k", fetchImpl as unknown as typeof fetch).send(params)
    expect(result).toEqual({ ok: true, id: "email_abc" })
  })

  it("returns an error result on a non-2xx response", async () => {
    const fetchImpl = fakeFetch(422, { name: "validation_error", message: "Invalid `to` field" })
    const result = await createResendSender("re_k", fetchImpl as unknown as typeof fetch).send(params)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("Invalid `to` field")
  })

  it("returns an error result (does not throw) when the request fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down")
    })
    const result = await createResendSender("re_k", fetchImpl as unknown as typeof fetch).send(params)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("network down")
  })
})
