CREATE TABLE "reign_site_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" integer NOT NULL,
	"document" jsonb NOT NULL,
	"image_data" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reign_tenant_entitlements" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"tier" text DEFAULT 'starter' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_end" timestamp with time zone,
	"brand" jsonb DEFAULT '{"name":"Reign Services","logo":null}'::jsonb NOT NULL,
	"platform_logo" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reign_site_plans" ADD CONSTRAINT "reign_site_plans_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;