ALTER TABLE "overrides" DROP CONSTRAINT "overrides_expense_type_valid";--> statement-breakpoint
ALTER TABLE "overrides" ALTER COLUMN "expense_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "overrides" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "overrides" ADD CONSTRAINT "overrides_category_household_fk" FOREIGN KEY ("household_id","category_id") REFERENCES "public"."categories"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "overrides_household_category_idx" ON "overrides" USING btree ("household_id","category_id");--> statement-breakpoint
ALTER TABLE "overrides" ADD CONSTRAINT "overrides_at_least_one_axis" CHECK ("overrides"."expense_type" IS NOT NULL OR "overrides"."category_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "overrides" ADD CONSTRAINT "overrides_expense_type_valid" CHECK ("overrides"."expense_type" IS NULL OR "overrides"."expense_type" IN ('Fixed', 'Necessary', 'Nice to have', ''));