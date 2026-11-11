-- "Reportar problema": the reports sent from the app (message, page, browser,
-- version), listed in the console's Pedidos and emailed to its admins.
CREATE TABLE IF NOT EXISTS "support_reports" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"message" text NOT NULL,
	"page" text DEFAULT '' NOT NULL,
	"ua" text DEFAULT '' NOT NULL,
	"version" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_reports_status_chk" CHECK ("support_reports"."status" in ('new','done')),
	CONSTRAINT "support_reports_len" CHECK (char_length("support_reports"."message") between 1 and 4000 and char_length("support_reports"."page") <= 500 and char_length("support_reports"."ua") <= 300 and char_length("support_reports"."version") <= 60)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_reports_created_idx" ON "support_reports" ("created_at");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "support_reports" TO kh_app;
