import { merchantRules } from "@/lib/db/schema";
import { normalizeMerchant } from "@/shared/merchant-rules";
import { isExpenseType } from "@/shared/types";

/** A merchant rule ready to insert (the household is stamped by the repo). */
export type NewMerchantRule = Omit<typeof merchantRules.$inferInsert, "householdId">;

export type ParseResult = { ok: true; value: NewMerchantRule } | { ok: false; error: string };

/** Cap on a normalized merchant string; mirrors the ingest-time `MAX_FIELD_LENGTH` (parse-csv.ts). */
const MAX_MERCHANT_LENGTH = 200;

/** A v4-ish UUID shape; the DB FK enforces that it is a real same-Household Category (ADR-0020). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate and normalize a merchant-rule create request (Phase F), mirroring the DB CHECK
 * constraints so a bad request is a clean 400 rather than a constraint violation. A rule is either
 * flat (`flatType`) or split (`threshold` + `atOrAboveType` + `belowType`), never both. Expense
 * types must be known (`""` allowed); the threshold is a positive integer. The merchant is
 * normalized the same way matching normalizes it, so a rule keys off the form it will compare against.
 */
export function parseMerchantRuleInput(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "expected a JSON object" };
  }
  const input = body as Record<string, unknown>;

  if (typeof input.merchant !== "string") {
    return { ok: false, error: "merchant is required" };
  }
  const merchant = normalizeMerchant(input.merchant);
  if (merchant === "") {
    return { ok: false, error: "merchant is empty" };
  }
  // Bounded so a rule can't store an unbounded string (mirrors the 200-char cap on ingested
  // merchants); the merchant is what matching compares against.
  if (merchant.length > MAX_MERCHANT_LENGTH) {
    return { ok: false, error: "merchant too long" };
  }

  // Optional semantic Category (ADR-0020), applied alongside the type on a match. Orthogonal to the
  // flat/split shape. The DB FK enforces it's a real same-Household Category; here we only shape-check.
  let categoryId: string | undefined;
  if (input.categoryId !== undefined && input.categoryId !== null) {
    if (typeof input.categoryId !== "string" || !UUID_RE.test(input.categoryId)) {
      return { ok: false, error: "invalid categoryId" };
    }
    categoryId = input.categoryId;
  }

  const hasFlat = input.flatType !== undefined;
  const hasSplit =
    input.threshold !== undefined ||
    input.atOrAboveType !== undefined ||
    input.belowType !== undefined;

  if (hasFlat && hasSplit) {
    return { ok: false, error: "provide either a flat type or a split rule, not both" };
  }

  if (hasFlat) {
    if (!isExpenseType(input.flatType)) {
      return { ok: false, error: "invalid flatType" };
    }
    return { ok: true, value: { merchant, flatType: input.flatType, categoryId } };
  }

  if (hasSplit) {
    if (
      typeof input.threshold !== "number" ||
      !Number.isInteger(input.threshold) ||
      input.threshold <= 0
    ) {
      return { ok: false, error: "threshold must be a positive integer" };
    }
    if (!isExpenseType(input.atOrAboveType) || !isExpenseType(input.belowType)) {
      return { ok: false, error: "invalid split types" };
    }
    return {
      ok: true,
      value: {
        merchant,
        threshold: input.threshold,
        atOrAboveType: input.atOrAboveType,
        belowType: input.belowType,
        categoryId,
      },
    };
  }

  return { ok: false, error: "provide a flat type or a split rule" };
}
