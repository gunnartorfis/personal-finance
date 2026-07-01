CREATE TYPE "public"."bank_connection_status" AS ENUM('active', 'expiring', 'expired', 'error', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."ingestion_source" AS ENUM('csv', 'bank_sync');--> statement-breakpoint
CREATE TABLE "bank_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_connection_id" text NOT NULL,
	"institution_id" text,
	"institution_name" text,
	"status" "bank_connection_status" DEFAULT 'active' NOT NULL,
	"consent_expires_at" timestamp with time zone,
	"access_token" text,
	"refresh_token" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_connections_household_id_id_key" UNIQUE("household_id","id"),
	CONSTRAINT "bank_connections_household_provider_conn_key" UNIQUE("household_id","provider","provider_connection_id")
);
--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "upload_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "source_row" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "external_account_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "source" "ingestion_source" DEFAULT 'csv' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_connection_household_fk" FOREIGN KEY ("household_id","connection_id") REFERENCES "public"."bank_connections"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_household_account_external_key" ON "transactions" USING btree ("household_id","account_id","external_id") WHERE "transactions"."external_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_source_provenance" CHECK (("transactions"."source" = 'csv' AND "transactions"."upload_id" IS NOT NULL AND "transactions"."external_id" IS NULL)
        OR ("transactions"."source" = 'bank_sync' AND "transactions"."upload_id" IS NULL AND "transactions"."external_id" IS NOT NULL));