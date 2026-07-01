ALTER TABLE "accounts" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: every existing Household must own exactly one default account (ADR-0004).
-- Households that already have accounts: promote the oldest to default.
UPDATE "accounts" SET "is_default" = true
WHERE "id" IN (
  SELECT DISTINCT ON ("household_id") "id"
  FROM "accounts"
  ORDER BY "household_id", "created_at" ASC, "id" ASC
);--> statement-breakpoint
-- Households with no accounts at all: create their default account.
-- 'Main account' must match DEFAULT_ACCOUNT_NAME in lib/household/default-account.ts.
INSERT INTO "accounts" ("household_id", "name", "is_default")
SELECT "h"."id", 'Main account', true
FROM "households" "h"
WHERE NOT EXISTS (
  SELECT 1 FROM "accounts" "a" WHERE "a"."household_id" = "h"."id"
);--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_one_default_per_household" ON "accounts" USING btree ("household_id") WHERE "accounts"."is_default";
