ALTER TABLE "overrides" DROP CONSTRAINT "overrides_transaction_id_transactions_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_upload_id_uploads_id_fk";
--> statement-breakpoint
ALTER TABLE "uploads" DROP CONSTRAINT "uploads_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_household_id_id_key" UNIQUE("household_id","id");--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_household_id_id_key" UNIQUE("household_id","id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_household_id_id_key" UNIQUE("household_id","id");--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_household_id_file_hash_key" UNIQUE("household_id","file_hash");--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_account_household_fk" FOREIGN KEY ("household_id","account_id") REFERENCES "public"."accounts"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_household_fk" FOREIGN KEY ("household_id","account_id") REFERENCES "public"."accounts"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_upload_household_fk" FOREIGN KEY ("household_id","upload_id") REFERENCES "public"."uploads"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overrides" ADD CONSTRAINT "overrides_transaction_household_fk" FOREIGN KEY ("household_id","transaction_id") REFERENCES "public"."transactions"("household_id","id") ON DELETE cascade ON UPDATE no action;
