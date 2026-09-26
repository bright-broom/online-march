ALTER TABLE "farm_orders" ADD COLUMN "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "farm_orders" ADD COLUMN "cancel_request_reason" text;--> statement-breakpoint
ALTER TABLE "farm_orders" ADD COLUMN "cancel_request_answer" text;--> statement-breakpoint
ALTER TABLE "farm_orders" ADD COLUMN "cancel_request_answered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "farm_orders" ADD COLUMN "cancel_request_reply" text;