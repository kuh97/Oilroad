CREATE TABLE "refuel_point" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"brand_code" text NOT NULL,
	"energy_type" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"katec_x" double precision,
	"katec_y" double precision,
	"address_road" text,
	"address_jibun" text,
	"tel" text,
	"sigun_cd" text,
	"has_car_wash" boolean DEFAULT false NOT NULL,
	"has_maintenance" boolean DEFAULT false NOT NULL,
	"has_cvs" boolean DEFAULT false NOT NULL,
	"is_kpetro" boolean DEFAULT false NOT NULL,
	"last_price" integer,
	"last_price_prod" text,
	"price_traded_at" timestamp with time zone,
	"source" text NOT NULL,
	"detail_synced_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sigungu_avg_price" (
	"sigun_cd" text NOT NULL,
	"prod_cd" text NOT NULL,
	"avg_price" integer NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sigungu_avg_price_sigun_cd_prod_cd_pk" PRIMARY KEY("sigun_cd","prod_cd")
);
--> statement-breakpoint
CREATE INDEX "idx_refuel_point_sigun" ON "refuel_point" USING btree ("sigun_cd");--> statement-breakpoint
CREATE INDEX "idx_refuel_point_energy" ON "refuel_point" USING btree ("energy_type");