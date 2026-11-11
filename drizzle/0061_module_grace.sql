-- Pricing policy (review 11/11): a module taken out of a plan stays with the
-- clients that already had it until their renewal, at least 30 days, and they
-- are told by email (server/admin/plans.ts). Nothing existing changes.
CREATE TABLE IF NOT EXISTS "tenant_module_grace" (
	"tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"module_id" text NOT NULL REFERENCES "public"."modules"("id"),
	"until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_module_grace_pk" PRIMARY KEY ("tenant_id", "module_id")
);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_module_grace" TO kh_app;
