CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"parent_id" uuid,
	"slug" text NOT NULL,
	"label_key" text,
	"label" text,
	"default_expense_type" text,
	"icon" text,
	"synonyms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_seed" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_household_id_id_key" UNIQUE("household_id","id"),
	CONSTRAINT "categories_household_slug_key" UNIQUE("household_id","slug"),
	CONSTRAINT "categories_label_source" CHECK (("categories"."label_key" IS NOT NULL AND "categories"."label" IS NULL) OR ("categories"."label_key" IS NULL AND "categories"."label" IS NOT NULL)),
	CONSTRAINT "categories_default_expense_type_valid" CHECK ("categories"."default_expense_type" IS NULL OR "categories"."default_expense_type" IN ('Fixed', 'Necessary', 'Nice to have'))
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_household_fk" FOREIGN KEY ("household_id","parent_id") REFERENCES "public"."categories"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_household_parent_idx" ON "categories" USING btree ("household_id","parent_id");