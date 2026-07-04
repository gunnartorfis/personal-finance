ALTER TABLE "savings_goals" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_title_len" CHECK ("savings_goals"."title" is null or char_length("savings_goals"."title") between 1 and 60);
