-- "Desde" (year only) becomes the hiring date: 2019 → 2019-01-01.
UPDATE "mg_people" SET "hired" = "since" || '-01-01' WHERE "since" ~ '^\d{4}$';--> statement-breakpoint
ALTER TABLE "mg_people" DROP COLUMN "since";
