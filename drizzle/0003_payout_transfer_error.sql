ALTER TABLE "payouts" ADD COLUMN "transfer_error" text;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "transfer_attempted_at" timestamp with time zone;