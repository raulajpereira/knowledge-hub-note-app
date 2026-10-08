ALTER TABLE "mg_people" ADD COLUMN "status" text DEFAULT 'Ativo' NOT NULL;--> statement-breakpoint
ALTER TABLE "mg_people" ADD COLUMN "status_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mg_people" ADD COLUMN "hired" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mg_people" ADD COLUMN "exp_years" double precision;--> statement-breakpoint
ALTER TABLE "mg_people" ADD CONSTRAINT "mg_people_status_check" CHECK ("status" IN ('Ativo', 'Inativo', 'Suspenso'));
