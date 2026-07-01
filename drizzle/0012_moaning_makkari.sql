CREATE TABLE "savings_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"cycle_key" text NOT NULL,
	"monthly_income" integer NOT NULL,
	"cycle_extra" integer DEFAULT 0 NOT NULL,
	"off_card_fixed" integer NOT NULL,
	"card_debits" integer NOT NULL,
	"inferred_saving" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_checkins_household_id_cycle_key" UNIQUE("household_id","cycle_key"),
	CONSTRAINT "savings_checkins_cycle_key_format" CHECK ("savings_checkins"."cycle_key" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "savings_checkins_monthly_income_nonneg" CHECK ("savings_checkins"."monthly_income" >= 0),
	CONSTRAINT "savings_checkins_cycle_extra_nonneg" CHECK ("savings_checkins"."cycle_extra" >= 0),
	CONSTRAINT "savings_checkins_off_card_fixed_nonneg" CHECK ("savings_checkins"."off_card_fixed" >= 0),
	CONSTRAINT "savings_checkins_card_debits_nonneg" CHECK ("savings_checkins"."card_debits" >= 0),
	CONSTRAINT "savings_checkins_inferred_reconciles" CHECK ("savings_checkins"."inferred_saving" = "savings_checkins"."monthly_income" + "savings_checkins"."cycle_extra" - "savings_checkins"."off_card_fixed" - "savings_checkins"."card_debits")
);
--> statement-breakpoint
CREATE TABLE "savings_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"target" integer NOT NULL,
	"target_date" date NOT NULL,
	"starting_saved" integer DEFAULT 0 NOT NULL,
	"start_cycle" text NOT NULL,
	"currency" text DEFAULT 'ISK' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_goals_household_id_key" UNIQUE("household_id"),
	CONSTRAINT "savings_goals_target_positive" CHECK ("savings_goals"."target" > 0),
	CONSTRAINT "savings_goals_starting_saved_nonneg" CHECK ("savings_goals"."starting_saved" >= 0),
	CONSTRAINT "savings_goals_start_cycle_format" CHECK ("savings_goals"."start_cycle" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "savings_goals_currency_iso4217" CHECK ("savings_goals"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "savings_goals_target_after_start_cycle" CHECK ("savings_goals"."target_date" > to_date("savings_goals"."start_cycle" || '-01', 'YYYY-MM-DD'))
);
--> statement-breakpoint
CREATE TABLE "savings_income_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_income_sources_amount_nonneg" CHECK ("savings_income_sources"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "savings_offcard_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"monthly_amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_offcard_costs_monthly_amount_nonneg" CHECK ("savings_offcard_costs"."monthly_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "savings_checkins" ADD CONSTRAINT "savings_checkins_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_income_sources" ADD CONSTRAINT "savings_income_sources_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_offcard_costs" ADD CONSTRAINT "savings_offcard_costs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;