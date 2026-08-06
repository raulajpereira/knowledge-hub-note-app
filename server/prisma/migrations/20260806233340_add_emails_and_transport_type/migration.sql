-- AlterTable
ALTER TABLE `transport_requests` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT 'customizing';

-- CreateTable
CREATE TABLE `emails` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `fromName` VARCHAR(191) NULL,
    `fromAddress` VARCHAR(191) NULL,
    `toRecipients` JSON NULL,
    `ccRecipients` JSON NULL,
    `sentAt` DATETIME(3) NULL,
    `bodyHtml` LONGTEXT NULL,
    `bodyText` LONGTEXT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NOT NULL DEFAULT 0,
    `attachments` JSON NULL,
    `favorite` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `emails_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `emails` ADD CONSTRAINT `emails_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
