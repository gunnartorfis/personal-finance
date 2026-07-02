CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted', 'revoked');--> statement-breakpoint
CREATE TABLE "household_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_member_id" uuid,
	"status" "invite_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "household_invites_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "household_invites_email_lowercase" CHECK ("household_invites"."email" = lower("household_invites"."email")),
	CONSTRAINT "household_invites_accepted_has_timestamp" CHECK ("household_invites"."status" <> 'accepted' OR "household_invites"."accepted_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_inviter_household_fk" FOREIGN KEY ("household_id","invited_by_member_id") REFERENCES "public"."members"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "household_invites_household_email_pending_key" ON "household_invites" USING btree ("household_id","email") WHERE "household_invites"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "household_invites_email_pending_idx" ON "household_invites" USING btree ("email") WHERE "household_invites"."status" = 'pending';