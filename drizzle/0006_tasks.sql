CREATE TABLE "task_subtasks" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "task_subtasks_title_len" CHECK (char_length("task_subtasks"."title") <= 300)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'tech' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"due_on" date,
	"repeat" text DEFAULT 'none' NOT NULL,
	"project_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tasks_title_len" CHECK (char_length("tasks"."title") <= 300),
	CONSTRAINT "tasks_notes_len" CHECK (char_length("tasks"."notes") <= 20000),
	CONSTRAINT "tasks_type_chk" CHECK ("tasks"."type" in ('tech','mgmt')),
	CONSTRAINT "tasks_priority_chk" CHECK ("tasks"."priority" in ('low','medium','high')),
	CONSTRAINT "tasks_repeat_chk" CHECK ("tasks"."repeat" in ('none','daily','weekly','monthly'))
);
--> statement-breakpoint
ALTER TABLE "task_subtasks" ADD CONSTRAINT "task_subtasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_subtasks" ADD CONSTRAINT "task_subtasks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_subtasks" ADD CONSTRAINT "task_subtasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_subtasks_task_idx" ON "task_subtasks" USING btree ("task_id","sort");--> statement-breakpoint
CREATE INDEX "tasks_owner_idx" ON "tasks" USING btree ("tenant_id","owner_id","created_at");--> statement-breakpoint
CREATE INDEX "tasks_due_idx" ON "tasks" USING btree ("tenant_id","owner_id","due_on");--> statement-breakpoint
-- RLS as for notes (0005): only the owner, inside its tenant.
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_subtasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tasks_owner" ON "tasks" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());--> statement-breakpoint
CREATE POLICY "task_subtasks_owner" ON "task_subtasks" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());
