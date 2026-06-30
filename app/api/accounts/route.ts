import { NextResponse } from "next/server"

import { requireHousehold } from "@/lib/household/current"

/**
 * Accounts for the current Household (ADR-0002/0004): the card/bank accounts an upload's rows belong
 * to. `GET` lists them; `POST` creates one from `{ name }`. Household-scoped via the repo.
 */
export async function GET() {
  const { repo } = await requireHousehold()
  return NextResponse.json(await repo.accounts.list())
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const name = (body as { name?: unknown } | null)?.name
  if (typeof name !== "string" || name.trim() === "") {
    return NextResponse.json({ error: "name is required" }, { status: 400 })
  }

  const { repo } = await requireHousehold()
  const [account] = await repo.accounts.create({ name: name.trim() })
  return NextResponse.json(account, { status: 201 })
}
