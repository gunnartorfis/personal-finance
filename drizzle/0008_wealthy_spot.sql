CREATE TABLE "straumur_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid,
	"psp_reference" text NOT NULL,
	"merchant_reference" text,
	"checkout_reference" text,
	"recurring_detail_reference" text,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"success" boolean NOT NULL,
	"event_code" text NOT NULL,
	"reason" text,
	"raw_event" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "straumur_payments_psp_reference_unique" UNIQUE("psp_reference")
);
