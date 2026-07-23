import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { UploadForm } from "@/components/upload-form"
import { renderWithIntl as render } from "@/lib/test/render"

afterEach(() => vi.unstubAllGlobals())

const ACCOUNTS = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Visa", isDefault: true },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Landsbankinn",
    isDefault: false,
  },
]

/** A confident heuristic preview (auto-commits): all roles mapped to distinct columns, no dupes. */
const OK_PREVIEW = {
  status: "ok",
  header: ["Date", "Merchant", "Category", "Amount"],
  detectedMapping: { date: 0, merchant: 1, category: 2, amount: 3 },
  mappingSource: "heuristic",
  unmatchedRoles: [],
  rows: [{ sourceRow: 0, date: "2026-01-01", amount: 100, merchant: "Cafe", rawCategory: "Food" }],
  newCount: 3,
  duplicateCount: 0,
  wholeFileDuplicate: false,
}

/** Stateful fetch double: accounts, preview, commit, and the progress poll. */
function stubApi(
  opts: {
    previewStatus?: number
    previewBody?: unknown
    uploadStatus?: number
    uploadBody?: unknown
    rowsStatus?: number
    rowsBody?: unknown
  } = {},
) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET"
    if (url === "/api/accounts" && method === "GET") {
      return { ok: true, json: async () => ACCOUNTS }
    }
    if (url === "/api/uploads/preview" && method === "POST") {
      const status = opts.previewStatus ?? 200
      return { ok: status < 400, status, json: async () => opts.previewBody ?? OK_PREVIEW }
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
    if (url.startsWith("/api/uploads/") && url.endsWith("/rows") && method === "POST") {
      const status = opts.rowsStatus ?? 201
      return {
        ok: status < 400,
        status,
        json: async () => opts.rowsBody ?? { appended: 1, duplicates: 0, alreadyImported: [] },
      }
    }
    if (url === "/api/classify" && method === "POST") {
      return { ok: true, json: async () => ({ classified: 0, failed: 0, capped: 0 }) }
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

const uploadPost = (m: ReturnType<typeof stubApi>) =>
  m.mock.calls.find((c) => c[0] === "/api/uploads" && (c[1] as RequestInit)?.method === "POST")

async function pickAndSubmit(accountId?: string) {
  await screen.findByRole("option", { name: "Visa" })
  if (accountId) await userEvent.selectOptions(screen.getByLabelText(/account/i), accountId)
  await userEvent.upload(screen.getByLabelText(/csv file/i), csvFile())
  await userEvent.click(screen.getByRole("button", { name: /upload/i }))
}

describe("UploadForm", () => {
  it("lists the household's accounts in the selector", async () => {
    stubApi()
    render(<UploadForm />)
    expect(await screen.findByRole("option", { name: "Visa" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Landsbankinn" })).toBeInTheDocument()
  })

  it("auto-commits a confident preview and shows progress + summary", async () => {
    const fetchMock = stubApi()
    render(<UploadForm />)
    await pickAndSubmit(ACCOUNTS[1].id)

    expect(await screen.findByRole("progressbar")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(/3 added/i)

    const body = (uploadPost(fetchMock)![1] as RequestInit).body as FormData
    expect(body.get("accountId")).toBe(ACCOUNTS[1].id)
    expect((body.get("file") as File).name).toBe("statement.csv")
    // A confident import commits without a mapping (the server replays heuristic/remembered).
    expect(body.get("mapping")).toBeNull()
  })

  it("surfaces a 4xx preview error inline", async () => {
    stubApi({ previewStatus: 422, previewBody: { error: "could not parse CSV" } })
    render(<UploadForm />)
    await pickAndSubmit(ACCOUNTS[0].id)

    expect(await screen.findByRole("alert")).toHaveTextContent(/parse/i)
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it("shows an error when the accounts fail to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/accounts"
          ? { ok: false, status: 500, json: async () => ({}) }
          : { ok: false, status: 404, json: async () => ({}) },
      ),
    )
    render(<UploadForm />)
    expect(await screen.findByText(/couldn.t load accounts/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /upload/i })).toBeDisabled()
  })

  it("shows the Import preview for an AI-suggested mapping and commits with the mapping on confirm", async () => {
    const fetchMock = stubApi({
      previewBody: {
        status: "ok",
        header: ["Col A", "Col B", "Col C", "Col D"],
        detectedMapping: { date: 0, merchant: 1, category: 2, amount: 3 },
        mappingSource: "ai",
        unmatchedRoles: [],
        rows: [{ sourceRow: 0, date: "2026-01-01", amount: 100, merchant: "Cafe", rawCategory: "Food" }],
        newCount: 1,
        duplicateCount: 0,
        wholeFileDuplicate: false,
      },
    })
    render(<UploadForm />)
    await pickAndSubmit(ACCOUNTS[0].id)

    // Not auto-committed: the review panel appears with a confirm action.
    const confirm = await screen.findByRole("button", { name: /confirm import/i })
    expect(uploadPost(fetchMock)).toBeUndefined()

    await userEvent.click(confirm)
    await screen.findByRole("progressbar")
    const body = (uploadPost(fetchMock)![1] as RequestInit).body as FormData
    expect(JSON.parse(body.get("mapping") as string)).toEqual({
      date: 0,
      merchant: 1,
      category: 2,
      amount: 3,
    })
  })

  it("shows a 'nothing new' notice for a whole-file duplicate and does not commit", async () => {
    const fetchMock = stubApi({
      previewBody: { ...OK_PREVIEW, newCount: 0, duplicateCount: 3, wholeFileDuplicate: true },
    })
    render(<UploadForm />)
    await pickAndSubmit(ACCOUNTS[0].id)

    expect(await screen.findByText(/nothing new to import/i)).toBeInTheDocument()
    expect(uploadPost(fetchMock)).toBeUndefined()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it("stops on the preview (does not auto-commit) when the file adds no new rows", async () => {
    const fetchMock = stubApi({
      previewBody: { ...OK_PREVIEW, newCount: 0, duplicateCount: 0, rows: [] },
    })
    render(<UploadForm />)
    await pickAndSubmit(ACCOUNTS[0].id)

    // Confident mapping but nothing new → review panel, not a silent commit.
    expect(await screen.findByRole("button", { name: /confirm import/i })).toBeInTheDocument()
    expect(uploadPost(fetchMock)).toBeUndefined()
  })

  it("maps a 404 (deleted account) preview to the unknown-account message", async () => {
    stubApi({ previewStatus: 404, previewBody: { status: "unknown-account" } })
    render(<UploadForm />)
    await pickAndSubmit(ACCOUNTS[0].id)

    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer exists/i)
  })

  it("shows all three outcome buckets and no longer says 'skipped'", async () => {
    stubApi({
      uploadBody: {
        status: "created",
        upload: { id: "u1" },
        appended: 3,
        duplicates: 2,
        couldntRead: [
          { sourceRow: 1, reason: "bad-amount", date: "05.03.2026", amount: "x", merchant: "BÓNUS", category: "Verslun" },
        ],
        couldntReadTotal: 1,
        ignoredCount: 0,
        systematic: false,
      },
    })
    render(<UploadForm />)
    await pickAndSubmit(ACCOUNTS[0].id)

    const status = await screen.findByRole("status")
    expect(status).toHaveTextContent(/3 added/i)
    expect(status).toHaveTextContent(/2 already imported/i)
    expect(status).toHaveTextContent(/1 couldn.t read/i)
    expect(status).not.toHaveTextContent(/skipped/i)
  })

  it("lists the couldn't-read rows when the details are expanded", async () => {
    stubApi({
      uploadBody: {
        status: "created",
        upload: { id: "u1" },
        appended: 1,
        duplicates: 0,
        couldntRead: [
          { sourceRow: 1, reason: "bad-amount", date: "05.03.2026", amount: "ódýrt", merchant: "BÓNUS", category: "Verslun" },
        ],
        couldntReadTotal: 1,
        ignoredCount: 0,
        systematic: false,
      },
    })
    render(<UploadForm />)
    await pickAndSubmit(ACCOUNTS[0].id)
    await screen.findByRole("status")

    await userEvent.click(screen.getByRole("button", { name: /show details/i }))
    // The couldn't-read row is an editable Fix & import form, prefilled from the raw cells.
    expect(screen.getByDisplayValue("BÓNUS")).toBeInTheDocument()
    expect(screen.getByDisplayValue("2026-03-05")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /fix & import/i })).toBeInTheDocument()
  })

  it("fixes & imports a couldn't-read row and moves it into the added bucket", async () => {
    const fetchMock = stubApi({
      uploadBody: {
        status: "created",
        upload: { id: "u1" },
        appended: 0,
        duplicates: 0,
        couldntRead: [
          { sourceRow: 1, reason: "bad-amount", date: "05.03.2026", amount: "", merchant: "BÓNUS", category: "Verslun" },
        ],
        couldntReadTotal: 1,
        ignoredCount: 0,
        systematic: false,
      },
      rowsBody: { appended: 1, duplicates: 0, alreadyImported: [] },
    })
    render(<UploadForm />)
    await pickAndSubmit(ACCOUNTS[0].id)
    await screen.findByRole("status")
    await userEvent.click(screen.getByRole("button", { name: /show details/i }))

    await userEvent.type(screen.getByLabelText(/amount/i), "-1990")
    await userEvent.click(screen.getByRole("button", { name: /fix & import/i }))

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith("/rows"))).toBe(true),
    )
    const rowsCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/rows"))!
    expect(String(rowsCall[0])).toBe("/api/uploads/u1/rows")
    expect(JSON.parse((rowsCall[1] as RequestInit).body as string)).toMatchObject({
      date: "2026-03-05",
      amount: -1990,
      merchant: "BÓNUS",
      sourceRow: 1,
    })

    // The row leaves the couldn't-read list and the summary counts one more added.
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/1 added/i))
    expect(screen.queryByRole("button", { name: /fix & import/i })).not.toBeInTheDocument()
  })

  it("caps the couldn't-read list and hints at a systematic failure", async () => {
    stubApi({
      uploadBody: {
        status: "created",
        upload: { id: "u1" },
        appended: 0,
        duplicates: 0,
        couldntRead: Array.from({ length: 50 }, (_, i) => ({
          sourceRow: i,
          reason: "bad-date",
          date: "2026-03-01",
          amount: "-1 kr.",
          merchant: `M${i}`,
          category: "C",
        })),
        couldntReadTotal: 200,
        ignoredCount: 0,
        systematic: true,
      },
    })
    render(<UploadForm />)
    await pickAndSubmit(ACCOUNTS[0].id)
    await screen.findByRole("status")

    await userEvent.click(screen.getByRole("button", { name: /show details/i }))
    expect(screen.getByText(/format may not be supported/i)).toBeInTheDocument()
    expect(screen.getByText(/\+\s*150 more/i)).toBeInTheDocument()
  })

  it("shows already-imported rows with provenance when details are expanded", async () => {
    stubApi({
      uploadBody: {
        status: "created",
        upload: { id: "u1" },
        appended: 1,
        duplicates: 1,
        alreadyImported: [
          {
            sourceRow: 0,
            date: "2026-03-01",
            amount: -650,
            merchant: "KAFFITAR",
            category: "Kaffi",
            importedAt: "2026-01-05T00:00:00.000Z",
            fileName: "dec.csv",
          },
        ],
        couldntRead: [],
        couldntReadTotal: 0,
        ignoredCount: 0,
        systematic: false,
      },
    })
    render(<UploadForm />)
    await pickAndSubmit(ACCOUNTS[0].id)
    await screen.findByRole("status")

    await userEvent.click(screen.getByRole("button", { name: /show details/i }))
    expect(screen.getByText("KAFFITAR")).toBeInTheDocument()
    // Provenance names the file the row first arrived in.
    expect(screen.getByText(/dec\.csv/)).toBeInTheDocument()
  })

  it("hides the picker and imports to the default when it's the only account", async () => {
    const fetchMock = stubApi()
    // Only one account: override the accounts response.
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET"
      if (url === "/api/accounts") return { ok: true, json: async () => [ACCOUNTS[0]] } as never
      if (url === "/api/uploads/preview" && method === "POST")
        return { ok: true, status: 200, json: async () => OK_PREVIEW } as never
      if (url === "/api/uploads" && method === "POST")
        return {
          ok: true,
          status: 201,
          json: async () => ({ status: "created", upload: { id: "u1" }, appended: 3, duplicates: 0 }),
        } as never
      if (url.startsWith("/api/uploads/") && url.endsWith("/progress"))
        return { ok: true, json: async () => ({ total: 3, pending: 0, classified: 3, failed: 0, done: true }) } as never
      if (url === "/api/classify" && method === "POST")
        return { ok: true, json: async () => ({ classified: 0, failed: 0, capped: 0 }) } as never
      return { ok: false, status: 404, json: async () => ({}) } as never
    })
    render(<UploadForm />)

    await userEvent.upload(screen.getByLabelText(/csv file/i), csvFile())
    await waitFor(() => expect(screen.getByRole("button", { name: /upload/i })).toBeEnabled())
    expect(screen.queryByLabelText(/account/i)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /upload/i }))
    await screen.findByRole("progressbar")
    const body = (uploadPost(fetchMock)![1] as RequestInit).body as FormData
    expect(body.get("accountId")).toBe(ACCOUNTS[0].id)
  })
})
