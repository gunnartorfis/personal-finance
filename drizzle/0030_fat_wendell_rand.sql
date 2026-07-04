CREATE TABLE "column_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"header_signature" text NOT NULL,
	"columns" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "column_mappings_household_id_header_signature_key" UNIQUE("household_id","header_signature")
);
--> statement-breakpoint
ALTER TABLE "column_mappings" ADD CONSTRAINT "column_mappings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;