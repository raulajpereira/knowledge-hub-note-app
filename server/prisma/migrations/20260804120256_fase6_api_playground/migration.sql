-- CreateTable
CREATE TABLE `api_folders` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `api_folders_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `api_requests` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `folderId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `method` VARCHAR(191) NOT NULL DEFAULT 'GET',
    `url` TEXT NOT NULL,
    `headers` JSON NULL,
    `queryParams` JSON NULL,
    `bodyType` VARCHAR(191) NOT NULL DEFAULT 'none',
    `body` TEXT NULL,
    `formBody` JSON NULL,
    `authType` VARCHAR(191) NOT NULL DEFAULT 'none',
    `authConfig` JSON NULL,
    `lastResponse` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `api_requests_userId_idx`(`userId`),
    INDEX `api_requests_folderId_idx`(`folderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `api_folders` ADD CONSTRAINT `api_folders_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `api_requests` ADD CONSTRAINT `api_requests_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `api_requests` ADD CONSTRAINT `api_requests_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `api_folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

