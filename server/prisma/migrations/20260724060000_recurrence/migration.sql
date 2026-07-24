-- AlterTable
ALTER TABLE `tasks` ADD COLUMN `recurrence` VARCHAR(191) NULL;
ALTER TABLE `issues` ADD COLUMN `recurrence` VARCHAR(191) NULL;
