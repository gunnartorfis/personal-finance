CREATE TABLE "category_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"expense_type" text NOT NULL,
	"monthly_amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_budgets_household_type_key" UNIQUE("household_id","expense_type"),
	CONSTRAINT "category_budgets_monthly_amount_positive" CHECK ("category_budgets"."monthly_amount" > 0),
	CONSTRAINT "category_budgets_expense_type_valid" CHECK ("category_budgets"."expense_type" IN ('Fixed', 'Necessary', 'Nice to have'))
);
--> statement-breakpoint
ALTER TABLE "category_budgets" ADD CONSTRAINT "category_budgets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;