-- CreateTable
CREATE TABLE `links` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `fromType` VARCHAR(191) NOT NULL,
    `fromId` VARCHAR(191) NOT NULL,
    `toType` VARCHAR(191) NOT NULL,
    `toId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `links_userId_fromType_fromId_idx`(`userId`, `fromType`, `fromId`),
    INDEX `links_userId_toType_toId_idx`(`userId`, `toType`, `toId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `links` ADD CONSTRAINT `links_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
