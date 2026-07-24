-- AlterTable
ALTER TABLE `artifacts` ADD COLUMN `folderId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `artifact_folders` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `artifact_folders_userId_idx`(`userId`),
    INDEX `artifact_folders_parentId_idx`(`parentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `artifacts_folderId_idx` ON `artifacts`(`folderId`);

-- AddForeignKey
ALTER TABLE `artifacts` ADD CONSTRAINT `artifacts_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `artifact_folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `artifact_folders` ADD CONSTRAINT `artifact_folders_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `artifact_folders` ADD CONSTRAINT `artifact_folders_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `artifact_folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
