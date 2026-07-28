-- AlterTable
ALTER TABLE `users` ADD COLUMN `role` ENUM('member', 'admin', 'super_admin') NOT NULL DEFAULT 'member',
    ADD COLUMN `status` ENUM('active', 'suspended') NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE `invite_codes` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `usedById` VARCHAR(191) NULL,
    `usedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `invite_codes_code_key`(`code`),
    UNIQUE INDEX `invite_codes_usedById_key`(`usedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `invite_codes` ADD CONSTRAINT `invite_codes_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invite_codes` ADD CONSTRAINT `invite_codes_usedById_fkey` FOREIGN KEY (`usedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: promote the operator's existing account to super_admin. Exactly one
-- super_admin is expected; only this account can ever change its own role.
UPDATE `users` SET `role` = 'super_admin' WHERE `email` = 'raul.a.j.pereira@gmail.com';
