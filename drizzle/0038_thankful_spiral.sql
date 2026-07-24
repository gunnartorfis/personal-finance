ALTER TABLE "uploads" DROP CONSTRAINT "uploads_household_id_file_hash_key";--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "undone_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "undone_by_member_id" uuid;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_undoer_household_fk" FOREIGN KEY ("household_id","undone_by_member_id") REFERENCES "public"."members"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uploads_household_id_file_hash_key" ON "uploads" USING btree ("household_id","file_hash") WHERE "uploads"."undone_at" IS NULL;