ALTER TABLE "accounts" ADD COLUMN "bank_account_fingerprint" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "bank_reference" text;
--> statement-breakpoint
-- Entry references used to be the fallback merchant for some bank imports.
UPDATE "transactions"
SET "merchant" = ''
WHERE "source" = 'bank_sync' AND "merchant" = "external_id";
--> statement-breakpoint
-- Return unsupported classifications to manual review. Overrides are stored separately.
UPDATE "transactions"
SET "classification_status" = 'pending',
    "expense_type" = NULL,
    "confidence" = NULL,
    "reasoning" = NULL,
    "category_id" = NULL,
    "category_confidence" = NULL
WHERE "amount" < 0
  AND "merchant" !~ '[^[:space:]]'
  AND "classification_status" <> 'pending';
