-- AlterTable
ALTER TABLE `settings`
  ADD COLUMN `accentHue` INTEGER NULL,
  ADD COLUMN `fontFamily` VARCHAR(191) NULL,
  ADD COLUMN `language` VARCHAR(191) NOT NULL DEFAULT 'pt';
