CREATE TABLE "bank_connection_intents" (
	"state" text PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"institution_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_connection_intents" ADD CONSTRAINT "bank_connection_intents_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;