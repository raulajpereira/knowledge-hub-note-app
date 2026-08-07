-- AlterTable
ALTER TABLE `emails` ADD COLUMN `folderId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `email_folders` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `email_folders_userId_idx`(`userId`),
    INDEX `email_folders_parentId_idx`(`parentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `emails_folderId_idx` ON `emails`(`folderId`);

-- AddForeignKey
ALTER TABLE `emails` ADD CONSTRAINT `emails_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `email_folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_folders` ADD CONSTRAINT `email_folders_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_folders` ADD CONSTRAINT `email_folders_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `email_folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
