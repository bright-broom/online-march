CREATE TABLE "farm_bank_accounts" (
	"farm_id" uuid PRIMARY KEY NOT NULL,
	"bank_name" text NOT NULL,
	"bank_code" text NOT NULL,
	"branch_name" text NOT NULL,
	"branch_code" text NOT NULL,
	"account_type" text NOT NULL,
	"account_number_enc" text NOT NULL,
	"account_number_last4" text NOT NULL,
	"holder_kana" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farm_bank_accounts" ADD CONSTRAINT "farm_bank_accounts_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;