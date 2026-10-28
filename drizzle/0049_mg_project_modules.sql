-- Management › Projetos: the SAP modules a project covers ('FI', 'MM', … or a
-- name of the tenant's own, upper case), in the order they were picked. Same
-- shape as mg_teams.areas; the table keeps its tenant RLS (0020).
-- Idempotent: safe to run twice.
ALTER TABLE "mg_projects" ADD COLUMN IF NOT EXISTS "modules" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "mg_projects" DROP CONSTRAINT IF EXISTS "mg_projects_modules_max";--> statement-breakpoint
ALTER TABLE "mg_projects" ADD CONSTRAINT "mg_projects_modules_max" CHECK (cardinality("mg_projects"."modules") <= 30);
