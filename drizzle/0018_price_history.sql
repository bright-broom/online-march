CREATE TABLE "variant_price_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"price" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "display_compare_at_price" integer;--> statement-breakpoint
ALTER TABLE "variant_price_periods" ADD CONSTRAINT "variant_price_periods_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "variant_price_periods_variant_idx" ON "variant_price_periods" USING btree ("variant_id","started_at");