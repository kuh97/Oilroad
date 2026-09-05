ALTER TABLE "refuel_point" ADD COLUMN "is_self" boolean;--> statement-breakpoint
ALTER TABLE "refuel_point" ADD COLUMN "coord_source" text;--> statement-breakpoint
ALTER TABLE "refuel_point" ADD COLUMN "price_gasoline" integer;--> statement-breakpoint
ALTER TABLE "refuel_point" ADD COLUMN "price_diesel" integer;--> statement-breakpoint
ALTER TABLE "refuel_point" ADD COLUMN "price_lpg" integer;--> statement-breakpoint
ALTER TABLE "refuel_point" ADD COLUMN "price_premium" integer;--> statement-breakpoint
ALTER TABLE "refuel_point" ADD COLUMN "price_kerosene" integer;--> statement-breakpoint
ALTER TABLE "refuel_point" ADD COLUMN "priced_on" date;--> statement-breakpoint
ALTER TABLE "refuel_point" ADD COLUMN "last_seen_on" date;--> statement-breakpoint
CREATE INDEX "idx_refuel_point_latlng" ON "refuel_point" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "idx_refuel_point_seen" ON "refuel_point" USING btree ("last_seen_on");