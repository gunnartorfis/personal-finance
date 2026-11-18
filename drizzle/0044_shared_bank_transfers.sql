CREATE TABLE "bank_transfer_rules" (
	"household_id" uuid NOT NULL,
	"counterparty_fingerprint" text NOT NULL,
	"anchor_transaction_id" uuid NOT NULL,
	"include_past" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_transfer_rules_household_counterparty_key" UNIQUE("household_id","counterparty_fingerprint")
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "counterparty_fingerprint" text;--> statement-breakpoint
ALTER TABLE "bank_transfer_rules" ADD CONSTRAINT "bank_transfer_rules_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_counterparty_fingerprint_idx" ON "transactions" USING btree ("household_id","counterparty_fingerprint") WHERE "transactions"."counterparty_fingerprint" IS NOT NULL;