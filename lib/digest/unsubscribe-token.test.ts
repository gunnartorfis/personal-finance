import { describe, expect, it } from "vitest"

import { digestUnsubscribeToken, verifyDigestUnsubscribeToken } from "./unsubscribe-token"

const SECRET = "test-unsub-secret"
const MEMBER = "11111111-2222-3333-4444-555555555555"

describe("digest unsubscribe token", () => {
  it("round-trips: a freshly minted token verifies back to the member id", () => {
    const token = digestUnsubscribeToken(MEMBER, SECRET)
    expect(verifyDigestUnsubscribeToken(token, SECRET)).toBe(MEMBER)
  })

  it("rejects a token signed with a different secret", () => {
    const token = digestUnsubscribeToken(MEMBER, SECRET)
    expect(verifyDigestUnsubscribeToken(token, "other-secret")).toBeNull()
  })

  it("rejects a tampered signature", () => {
    const token = digestUnsubscribeToken(MEMBER, SECRET)
    expect(verifyDigestUnsubscribeToken(`${token}x`, SECRET)).toBeNull()
  })

  it("rejects a swapped member id (signature no longer matches)", () => {
    const token = digestUnsubscribeToken(MEMBER, SECRET)
    const sig = token.slice(token.lastIndexOf(".") + 1)
    expect(verifyDigestUnsubscribeToken(`99999999-0000-0000-0000-000000000000.${sig}`, SECRET)).toBeNull()
  })

  it("rejects a malformed token with no signature", () => {
    expect(verifyDigestUnsubscribeToken(MEMBER, SECRET)).toBeNull()
    expect(verifyDigestUnsubscribeToken(`${MEMBER}.`, SECRET)).toBeNull()
    expect(verifyDigestUnsubscribeToken("", SECRET)).toBeNull()
  })
})
