-- CreateTable
CREATE TABLE `projects` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `scope` TEXT NULL,
    `description` TEXT NULL,
    `company` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `manager` VARCHAR(191) NULL,
    `contacts` JSON NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Ativo',
    `startDate` VARCHAR(191) NULL,
    `endDate` VARCHAR(191) NULL,
    `color` VARCHAR(191) NULL,
    `favorite` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `projects_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
