-- AlterTable
ALTER TABLE `tasks` ADD COLUMN `favorite` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `voice_notes` ADD COLUMN `favorite` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `issues` ADD COLUMN `favorite` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `artifacts` ADD COLUMN `favorite` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `code_folders` ADD COLUMN `favorite` BOOLEAN NOT NULL DEFAULT false;
