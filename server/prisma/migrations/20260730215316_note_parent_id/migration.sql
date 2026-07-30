-- AlterTable
ALTER TABLE `notes` ADD COLUMN `parentNoteId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `notes_parentNoteId_idx` ON `notes`(`parentNoteId`);

-- AddForeignKey
ALTER TABLE `notes` ADD CONSTRAINT `notes_parentNoteId_fkey` FOREIGN KEY (`parentNoteId`) REFERENCES `notes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
