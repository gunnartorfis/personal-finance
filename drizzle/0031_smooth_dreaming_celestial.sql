CREATE TABLE "digest_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"cycle_key" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digest_sends_member_cycle_key" UNIQUE("member_id","cycle_key"),
	CONSTRAINT "digest_sends_cycle_key_format" CHECK ("digest_sends"."cycle_key" ~ '^[0-9]{4}-[0-9]{2}$')
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "digest_unsubscribed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "digest_sends" ADD CONSTRAINT "digest_sends_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_sends" ADD CONSTRAINT "digest_sends_member_household_fk" FOREIGN KEY ("household_id","member_id") REFERENCES "public"."members"("household_id","id") ON DELETE cascade ON UPDATE no action;