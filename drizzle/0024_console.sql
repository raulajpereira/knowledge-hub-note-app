CREATE TABLE "console_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"plan_id" uuid,
	"groups" text[] DEFAULT '{}'::text[] NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"cycle" text DEFAULT 'monthly' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_requests_kind_chk" CHECK ("plan_requests"."kind" in ('plan','custom')),
	CONSTRAINT "plan_requests_status_chk" CHECK ("plan_requests"."status" in ('new','approved','rejected')),
	CONSTRAINT "plan_requests_cycle_chk" CHECK ("plan_requests"."cycle" in ('monthly','annual')),
	CONSTRAINT "plan_requests_seats_chk" CHECK ("plan_requests"."seats" between 1 and 9999)
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "addon_groups" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "contact_email" "citext";--> statement-breakpoint
ALTER TABLE "plan_requests" ADD CONSTRAINT "plan_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_requests" ADD CONSTRAINT "plan_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_requests" ADD CONSTRAINT "plan_requests_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_requests" ADD CONSTRAINT "plan_requests_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_requests_status_idx" ON "plan_requests" USING btree ("status","created_at");--> statement-breakpoint
-- Admin Console (Fase 10): "Em atraso" is set by hand (sales happen outside the app).
ALTER TABLE tenants DROP CONSTRAINT tenants_status_chk;--> statement-breakpoint
ALTER TABLE tenants ADD CONSTRAINT tenants_status_chk CHECK (status IN ('trial','active','past_due','suspended','canceled'));--> statement-breakpoint
-- Prices of the CUSTOM package per module group (€/user/month) and its annual discount (prototype `addon`, `customDisc`).
INSERT INTO console_settings (key, value) VALUES
  ('addon', '{"base":3,"pro":3,"mgmt":8,"dev":5,"sap":10,"feat":2,"custom":2}'::jsonb),
  ('customDisc', '20'::jsonb)
ON CONFLICT (key) DO NOTHING;
