-- AlterTable
ALTER TABLE `folders` ADD COLUMN `parentId` VARCHAR(191) NULL;
ALTER TABLE `code_folders` ADD COLUMN `parentId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `folders_parentId_idx` ON `folders`(`parentId`);
CREATE INDEX `code_folders_parentId_idx` ON `code_folders`(`parentId`);

-- AddForeignKey
ALTER TABLE `folders` ADD CONSTRAINT `folders_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `code_folders` ADD CONSTRAINT `code_folders_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `code_folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
