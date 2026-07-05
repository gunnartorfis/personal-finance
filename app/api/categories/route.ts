import { NextResponse } from "next/server"

import { requireHousehold } from "@/lib/household/current"
import { TYPES, type RealType } from "@/shared/types"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Cap a custom Category label so a row can't carry an unbounded string. */
const MAX_LABEL = 60
/** Cap the Lucide icon name (kebab-case slugs are short); the DB column is unbounded `text`. */
const MAX_ICON = 40

/**
 * Custom Categories for the current Household (ADR-0020).
 *
 * - `GET`  — list every Category row (groups + leaves, incl. hidden), for the customization UI.
 * - `POST` — add a custom leaf Subcategory under a group. The 2-level invariant is enforced in the
 *   repo (the parent must itself be a group): `parent_not_found` → 404, `parent_not_group` → 409.
 */
export async function GET() {
  const { repo } = await requireHousehold()
  return NextResponse.json(await repo.categories.list())
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    parentId?: unknown
    label?: unknown
    defaultExpenseType?: unknown
    icon?: unknown
  } | null
  if (!body || typeof body.parentId !== "string" || !UUID_RE.test(body.parentId)) {
    return NextResponse.json({ error: "a valid parentId is required" }, { status: 400 })
  }
  const label = typeof body.label === "string" ? body.label.trim() : ""
  if (label === "" || label.length > MAX_LABEL) {
    return NextResponse.json({ error: "a label of 1–60 characters is required" }, { status: 400 })
  }
  // A leaf's fallback Expense type, when given, must be a real discretionary bucket (never "").
  let defaultExpenseType: RealType | null = null
  if (body.defaultExpenseType != null && body.defaultExpenseType !== "") {
    if (!(TYPES as readonly string[]).includes(body.defaultExpenseType as string)) {
      return NextResponse.json({ error: "invalid defaultExpenseType" }, { status: 400 })
    }
    defaultExpenseType = body.defaultExpenseType as RealType
  }
  const icon = typeof body.icon === "string" && body.icon !== "" ? body.icon : null
  if (icon !== null && icon.length > MAX_ICON) {
    return NextResponse.json({ error: "icon name too long" }, { status: 400 })
  }

  const { repo } = await requireHousehold()
  const result = await repo.categories.createCustom({
    parentId: body.parentId,
    label,
    defaultExpenseType,
    icon,
  })
  if (!result.ok) {
    // Parent missing (or another tenant's) → 404; parent is itself a leaf → 409 (would be 3 levels).
    const status = result.error === "parent_not_found" ? 404 : 409
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json(result.row, { status: 201 })
}
