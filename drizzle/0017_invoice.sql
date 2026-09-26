ALTER TABLE "farms" ADD COLUMN "invoice_registration_number" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "tax_rate" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tax_rate" integer DEFAULT 8 NOT NULL;