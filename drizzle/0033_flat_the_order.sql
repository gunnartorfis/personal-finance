ALTER TABLE "transactions" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "category_confidence" real;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_household_fk" FOREIGN KEY ("household_id","category_id") REFERENCES "public"."categories"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_household_category_idx" ON "transactions" USING btree ("household_id","category_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_confidence_requires_category" CHECK ("transactions"."category_confidence" IS NULL OR "transactions"."category_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_confidence_range" CHECK ("transactions"."category_confidence" IS NULL OR ("transactions"."category_confidence" >= 0 AND "transactions"."category_confidence" <= 1));