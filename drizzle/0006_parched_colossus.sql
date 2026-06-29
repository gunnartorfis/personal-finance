CREATE TABLE "merchant_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"merchant" text NOT NULL,
	"flat_type" text,
	"threshold" integer,
	"at_or_above_type" text,
	"below_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_rules_household_id_merchant_key" UNIQUE("household_id","merchant"),
	CONSTRAINT "merchant_rules_one_shape" CHECK ((
        "merchant_rules"."flat_type" IS NOT NULL AND "merchant_rules"."threshold" IS NULL
          AND "merchant_rules"."at_or_above_type" IS NULL AND "merchant_rules"."below_type" IS NULL
      ) OR (
        "merchant_rules"."flat_type" IS NULL AND "merchant_rules"."threshold" IS NOT NULL
          AND "merchant_rules"."at_or_above_type" IS NOT NULL AND "merchant_rules"."below_type" IS NOT NULL
      )),
	CONSTRAINT "merchant_rules_types_valid" CHECK (("merchant_rules"."flat_type" IS NULL OR "merchant_rules"."flat_type" IN ('Fixed', 'Necessary', 'Nice to have', ''))
        AND ("merchant_rules"."at_or_above_type" IS NULL OR "merchant_rules"."at_or_above_type" IN ('Fixed', 'Necessary', 'Nice to have', ''))
        AND ("merchant_rules"."below_type" IS NULL OR "merchant_rules"."below_type" IN ('Fixed', 'Necessary', 'Nice to have', '')))
);
--> statement-breakpoint
ALTER TABLE "merchant_rules" ADD CONSTRAINT "merchant_rules_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;