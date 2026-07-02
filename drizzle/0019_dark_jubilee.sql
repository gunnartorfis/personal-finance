ALTER TABLE "transactions" ADD COLUMN "excluded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "exclusion_note" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_excluded_not_income" CHECK (NOT ("transactions"."excluded" AND "transactions"."income_marked"));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_exclusion_note_requires_excluded" CHECK ("transactions"."exclusion_note" IS NULL OR "transactions"."excluded");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_exclusion_note_length" CHECK ("transactions"."exclusion_note" IS NULL OR char_length("transactions"."exclusion_note") <= 280);