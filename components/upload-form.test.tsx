import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { UploadForm } from "@/components/upload-form"

afterEach(() => vi.unstubAllGlobals())

const ACCOUNTS = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Visa" },
  { id: "22222222-2222-2222-2222-222222222222", name: "Landsbankinn" },
]

/** Stateful fetch double: GET /api/accounts, POST /api/uploads, and the progress poll. */
function stubApi(opts: { uploadStatus?: number; uploadBody?: unknown } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET"
    if (url === "/api/accounts" && method === "GET") {
      return { ok: true, json: async () => ACCOUNTS }
    }
    if (url === "/api/uploads" && method === "POST") {
      const status = opts.uploadStatus ?? 201
      const body = opts.uploadBody ?? {
        status: "created",
        upload: { id: "upload-1" },
        appended: 3,
        duplicates: 0,
      }
      return { ok: status < 400, status, json: async () => body }
    }
    if (url.startsWith("/api/uploads/") && url.endsWith("/progress")) {
      return {
        ok: true,
        json: async () => ({ total: 3, pending: 0, classified: 3, failed: 0, done: true }),
      }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function csvFile() {
  return new File(["date,amount,merchant\n2026-01-01,100,Cafe"], "statement.csv", {
    type: "text/csv",
  })
}

describe("UploadForm", () => {
  it("lists the household's accounts in the selector", async () => {
    stubApi()
    render(<UploadForm />)
    expect(await screen.findByRole("option", { name: "Visa" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Landsbankinn" })).toBeInTheDocument()
  })

  it("uploads the chosen file for the chosen account and shows progress", async () => {
    const fetchMock = stubApi()
    render(<UploadForm />)
    await screen.findByRole("option", { name: "Visa" })

    await userEvent.selectOptions(screen.getByLabelText(/account/i), ACCOUNTS[1].id)
    await userEvent.upload(screen.getByLabelText(/csv file/i), csvFile())
    await userEvent.click(screen.getByRole("button", { name: /upload/i }))

    expect(await screen.findByRole("progressbar")).toBeInTheDocument()

    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "POST")!
    const body = (post[1] as RequestInit).body as FormData
    expect(body.get("accountId")).toBe(ACCOUNTS[1].id)
    expect((body.get("file") as File).name).toBe("statement.csv")
  })

  it("surfaces a 4xx upload error inline", async () => {
    stubApi({ uploadStatus: 422, uploadBody: { error: "could not parse CSV" } })
    render(<UploadForm />)
    await screen.findByRole("option", { name: "Visa" })

    await userEvent.selectOptions(screen.getByLabelText(/account/i), ACCOUNTS[0].id)
    await userEvent.upload(screen.getByLabelText(/csv file/i), csvFile())
    await userEvent.click(screen.getByRole("button", { name: /upload/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/parse/i)
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it("shows an error when the accounts fail to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/accounts") return { ok: false, status: 500, json: async () => ({}) }
        return { ok: false, status: 404, json: async () => ({}) }
      }),
    )
    render(<UploadForm />)
    expect(await screen.findByText(/couldn.t load accounts/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /upload/i })).toBeDisabled()
  })

  it("resets the form after a successful upload so the same file isn't re-posted", async () => {
    stubApi()
    render(<UploadForm />)
    await screen.findByRole("option", { name: "Visa" })

    await userEvent.selectOptions(screen.getByLabelText(/account/i), ACCOUNTS[0].id)
    await userEvent.upload(screen.getByLabelText(/csv file/i), csvFile())
    await userEvent.click(screen.getByRole("button", { name: /upload/i }))

    await screen.findByRole("progressbar")
    // fields cleared → button disabled again, no second submit possible
    expect(screen.getByRole("button", { name: /upload/i })).toBeDisabled()
    expect((screen.getByLabelText(/csv file/i) as HTMLInputElement).value).toBe("")
    expect((screen.getByLabelText(/account/i) as HTMLSelectElement).value).toBe("")
  })

  it("reports an already-imported file as a duplicate", async () => {
    stubApi({ uploadStatus: 409, uploadBody: { status: "duplicate", fileHash: "abc" } })
    render(<UploadForm />)
    await screen.findByRole("option", { name: "Visa" })

    await userEvent.selectOptions(screen.getByLabelText(/account/i), ACCOUNTS[0].id)
    await userEvent.upload(screen.getByLabelText(/csv file/i), csvFile())
    await userEvent.click(screen.getByRole("button", { name: /upload/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/already imported/i)
  })
})
