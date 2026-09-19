ALTER TABLE "farm_orders" ADD COLUMN "clawback_payout_id" uuid;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "refund_adjustment" integer DEFAULT 0 NOT NULL;