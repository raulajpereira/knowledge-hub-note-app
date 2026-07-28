-- AlterTable
ALTER TABLE `notes` ADD COLUMN `shareToken` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `notes_shareToken_key` ON `notes`(`shareToken`);
