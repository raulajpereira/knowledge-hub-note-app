-- AlterTable
ALTER TABLE `tasks` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'todo';

-- Backfill: tasks already marked done keep that state under the new column
UPDATE `tasks` SET `status` = 'done' WHERE `done` = true;
