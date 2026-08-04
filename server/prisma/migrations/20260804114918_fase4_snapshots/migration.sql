-- AlterTable
ALTER TABLE `note_versions` ADD COLUMN `label` VARCHAR(191) NULL,
    ADD COLUMN `manual` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `manual` BOOLEAN NOT NULL DEFAULT false,
    `data` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `snapshots_userId_idx`(`userId`),
    INDEX `snapshots_entityType_entityId_createdAt_idx`(`entityType`, `entityId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `snapshots` ADD CONSTRAINT `snapshots_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
