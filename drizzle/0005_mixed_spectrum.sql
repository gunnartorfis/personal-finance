ALTER TABLE "overrides" DROP CONSTRAINT "overrides_member_id_members_id_fk";
--> statement-breakpoint
ALTER TABLE "uploads" DROP CONSTRAINT "uploads_imported_by_member_id_members_id_fk";
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_household_id_id_key" UNIQUE("household_id","id");--> statement-breakpoint
ALTER TABLE "overrides" ADD CONSTRAINT "overrides_member_household_fk" FOREIGN KEY ("household_id","member_id") REFERENCES "public"."members"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_importer_household_fk" FOREIGN KEY ("household_id","imported_by_member_id") REFERENCES "public"."members"("household_id","id") ON DELETE no action ON UPDATE no action;
