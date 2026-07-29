-- CreateTable
CREATE TABLE `sap_transactions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tcode` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `module` VARCHAR(191) NOT NULL,
    `moduleGroup` VARCHAR(191) NOT NULL,
    `program` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'Transação Standard',
    `notes` TEXT NULL,
    `favorite` BOOLEAN NOT NULL DEFAULT false,
    `usageCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `sap_transactions_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sap_transactions` ADD CONSTRAINT `sap_transactions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
