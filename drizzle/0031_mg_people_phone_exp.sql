ALTER TABLE "mg_people" ADD COLUMN "exp_split" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "mg_people" ADD COLUMN "phone" text DEFAULT '' NOT NULL;