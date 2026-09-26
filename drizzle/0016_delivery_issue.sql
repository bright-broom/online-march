ALTER TABLE "farm_orders" ADD COLUMN "delivery_issue_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "farm_orders" ADD COLUMN "delivery_issue_note" text;