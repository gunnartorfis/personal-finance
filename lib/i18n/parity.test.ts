import { describe, expect, it } from "vitest"

import en from "@/messages/en.json"
import is from "@/messages/is.json"
import { flattenKeys } from "@/lib/i18n/parity"

describe("flattenKeys", () => {
  it("flattens nested message objects into sorted dot paths", () => {
    expect(flattenKeys({ a: { b: "x", c: "y" }, d: "z" })).toEqual([
      "a.b",
      "a.c",
      "d",
    ])
  })
})

describe("message catalogs", () => {
  it("en and is have identical key sets", () => {
    // Guards against the silent-fallback-to-English hole (ADR-0013): every key
    // present for one locale must exist for the other.
    expect(flattenKeys(is)).toEqual(flattenKeys(en))
  })
})
