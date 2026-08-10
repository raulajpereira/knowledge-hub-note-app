-- CreateTable
CREATE TABLE `code_requests` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `professionalArea` VARCHAR(191) NULL,
    `reason` TEXT NOT NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `inviteCodeId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `handledAt` DATETIME(3) NULL,

    UNIQUE INDEX `code_requests_inviteCodeId_key`(`inviteCodeId`),
    INDEX `code_requests_email_idx`(`email`),
    INDEX `code_requests_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `code_requests` ADD CONSTRAINT `code_requests_inviteCodeId_fkey` FOREIGN KEY (`inviteCodeId`) REFERENCES `invite_codes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
