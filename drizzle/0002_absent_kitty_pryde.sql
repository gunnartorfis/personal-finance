ALTER TABLE "households" ADD COLUMN "billing_currency" text DEFAULT 'ISK' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "billing_currency";--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_free_has_no_renewal" CHECK ("households"."plan" <> 'Free' OR "households"."plan_renews_at" IS NULL);--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_billing_currency_iso4217" CHECK ("households"."billing_currency" ~ '^[A-Z]{3}$');