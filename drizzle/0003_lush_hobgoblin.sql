CREATE TYPE "public"."classification_status" AS ENUM('pending', 'classified', 'failed');--> statement-breakpoint
CREATE TABLE "overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"member_id" uuid,
	"expense_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "overrides_transaction_id_unique" UNIQUE("transaction_id"),
	CONSTRAINT "overrides_expense_type_valid" CHECK ("overrides"."expense_type" IN ('Fixed', 'Necessary', 'Nice to have', ''))
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"date" date NOT NULL,
	"amount" integer NOT NULL,
	"original_amount" numeric,
	"original_currency" text,
	"merchant" text NOT NULL,
	"raw_category" text NOT NULL,
	"source_row" integer NOT NULL,
	"classification_status" "classification_status" DEFAULT 'pending' NOT NULL,
	"expense_type" text,
	"confidence" real,
	"reasoning" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_classified_has_type" CHECK (("transactions"."classification_status" = 'classified') = ("transactions"."expense_type" IS NOT NULL)),
	CONSTRAINT "transactions_expense_type_valid" CHECK ("transactions"."expense_type" IS NULL OR "transactions"."expense_type" IN ('Fixed', 'Necessary', 'Nice to have', '')),
	CONSTRAINT "transactions_original_amount_currency" CHECK (("transactions"."original_amount" IS NULL) = ("transactions"."original_currency" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"imported_by_member_id" uuid,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "overrides" ADD CONSTRAINT "overrides_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overrides" ADD CONSTRAINT "overrides_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overrides" ADD CONSTRAINT "overrides_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_imported_by_member_id_members_id_fk" FOREIGN KEY ("imported_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;