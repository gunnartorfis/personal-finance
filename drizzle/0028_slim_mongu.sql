CREATE TYPE "public"."assistant_message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TABLE "assistant_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"started_by_member_id" uuid,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_conversations_household_id_id_key" UNIQUE("household_id","id"),
	CONSTRAINT "assistant_conversations_title_len" CHECK (char_length("assistant_conversations"."title") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "assistant_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"member_id" uuid,
	"role" "assistant_message_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_messages_assistant_unattributed" CHECK ("assistant_messages"."role" <> 'assistant' OR "assistant_messages"."member_id" IS NULL),
	CONSTRAINT "assistant_messages_content_len" CHECK (char_length("assistant_messages"."content") BETWEEN 1 AND 10000)
);
--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_member_household_fk" FOREIGN KEY ("household_id","started_by_member_id") REFERENCES "public"."members"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_conversation_household_fk" FOREIGN KEY ("household_id","conversation_id") REFERENCES "public"."assistant_conversations"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_member_household_fk" FOREIGN KEY ("household_id","member_id") REFERENCES "public"."members"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_conversations_household_updated_idx" ON "assistant_conversations" USING btree ("household_id","updated_at");--> statement-breakpoint
CREATE INDEX "assistant_messages_conversation_created_idx" ON "assistant_messages" USING btree ("conversation_id","created_at");