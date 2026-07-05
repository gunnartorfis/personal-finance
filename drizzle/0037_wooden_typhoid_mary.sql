ALTER TABLE "category_budgets" RENAME TO "expense_type_budgets";--> statement-breakpoint
ALTER TABLE "expense_type_budgets" RENAME CONSTRAINT "category_budgets_household_id_households_id_fk" TO "expense_type_budgets_household_id_households_id_fk";
