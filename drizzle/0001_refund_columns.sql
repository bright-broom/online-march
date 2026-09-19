ALTER TYPE "public"."shipment_event_type" ADD VALUE 'refund';--> statement-breakpoint
ALTER TABLE "farm_orders" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "farm_orders" ADD COLUMN "refund_amount" integer;