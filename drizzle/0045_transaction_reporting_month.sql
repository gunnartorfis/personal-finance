ALTER TABLE "transactions" ADD COLUMN "reporting_month" date;--> statement-breakpoint
CREATE INDEX "transactions_household_reporting_date_idx" ON "transactions" USING btree ("household_id",coalesce("reporting_month", "date"));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reporting_month_first_day" CHECK (extract(day from "transactions"."reporting_month") = 1);