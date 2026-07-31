-- AlterTable
ALTER TABLE `settings` ADD COLUMN `faviconUrl` VARCHAR(191) NULL,
    ADD COLUMN `fontScale` VARCHAR(191) NOT NULL DEFAULT 'medium',
    ADD COLUMN `radiusStyle` VARCHAR(191) NOT NULL DEFAULT 'default';
