-- AlterTable
ALTER TABLE `tasks` ADD COLUMN `deletedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `voice_notes` ADD COLUMN `deletedAt` DATETIME(3) NULL;
