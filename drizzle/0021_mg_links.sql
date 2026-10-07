-- project_id of tasks, issues and transports now points at Management projects;
-- ids saved before (none were selectable) are cleared first.
UPDATE "tasks" SET "project_id" = NULL WHERE "project_id" IS NOT NULL AND "project_id" NOT IN (SELECT "id" FROM "mg_projects");--> statement-breakpoint
UPDATE "issues" SET "project_id" = NULL WHERE "project_id" IS NOT NULL AND "project_id" NOT IN (SELECT "id" FROM "mg_projects");--> statement-breakpoint
UPDATE "sap_transports" SET "project_id" = NULL WHERE "project_id" IS NOT NULL AND "project_id" NOT IN (SELECT "id" FROM "mg_projects");--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_id_mg_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."mg_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_mg_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."mg_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sap_transports" ADD CONSTRAINT "sap_transports_project_id_mg_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."mg_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" ("project_id") WHERE "project_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "issues_project_idx" ON "issues" ("project_id") WHERE "project_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "sap_transports_project_idx" ON "sap_transports" ("project_id") WHERE "project_id" IS NOT NULL;
