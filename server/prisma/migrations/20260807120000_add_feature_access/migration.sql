-- AlterTable
ALTER TABLE `users` ADD COLUMN `enabledFeatures` JSON NULL;

-- AlterTable
ALTER TABLE `invite_codes` ADD COLUMN `allowedFeatures` JSON NULL;
