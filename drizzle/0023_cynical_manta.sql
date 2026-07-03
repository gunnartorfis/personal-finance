CREATE TYPE "public"."one_off_kind" AS ENUM('income', 'cost');--> statement-breakpoint
CREATE TABLE "savings_one_off_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"cycle_key" text NOT NULL,
	"kind" "one_off_kind" NOT NULL,
	"amount" integer NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_one_off_adjustments_amount_nonneg" CHECK ("savings_one_off_adjustments"."amount" >= 0),
	CONSTRAINT "savings_one_off_adjustments_cycle_key_format" CHECK ("savings_one_off_adjustments"."cycle_key" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
ALTER TABLE "savings_income_sources" ADD COLUMN "effective_from" text DEFAULT '0001-01' NOT NULL;--> statement-breakpoint
ALTER TABLE "savings_offcard_costs" ADD COLUMN "effective_from" text DEFAULT '0001-01' NOT NULL;--> statement-breakpoint
--> ADR-0015 backfill: pre-existing flat rows become the baseline effective from their Household's
--> Savings goal start cycle; rows for a Household with no goal keep the '0001-01' floor (which is
--> functionally identical for the resolver — it is <= every real cycle). No-op on a fresh database.
UPDATE "savings_income_sources" AS s SET "effective_from" = g."start_cycle" FROM "savings_goals" g WHERE g."household_id" = s."household_id";--> statement-breakpoint
UPDATE "savings_offcard_costs" AS s SET "effective_from" = g."start_cycle" FROM "savings_goals" g WHERE g."household_id" = s."household_id";--> statement-breakpoint
ALTER TABLE "savings_one_off_adjustments" ADD CONSTRAINT "savings_one_off_adjustments_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "savings_one_off_adjustments_household_cycle_idx" ON "savings_one_off_adjustments" USING btree ("household_id","cycle_key");--> statement-breakpoint
ALTER TABLE "savings_income_sources" ADD CONSTRAINT "savings_income_sources_effective_from_format" CHECK ("savings_income_sources"."effective_from" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');--> statement-breakpoint
ALTER TABLE "savings_offcard_costs" ADD CONSTRAINT "savings_offcard_costs_effective_from_format" CHECK ("savings_offcard_costs"."effective_from" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');