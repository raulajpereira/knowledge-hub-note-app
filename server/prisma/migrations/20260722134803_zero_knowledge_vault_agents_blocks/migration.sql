/*
  Warnings:

  - You are about to drop the column `cipherText` on the `password_entries` table. All the data in the column will be lost.
  - You are about to drop the column `group` on the `password_entries` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `password_entries` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `password_entries` table. All the data in the column will be lost.
  - You are about to drop the column `url` on the `password_entries` table. All the data in the column will be lost.
  - You are about to drop the column `username` on the `password_entries` table. All the data in the column will be lost.
  - You are about to drop the column `vaultPasswordHash` on the `settings` table. All the data in the column will be lost.
  - Added the required column `envelope` to the `password_entries` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `notes` ADD COLUMN `blocks` JSON NULL;

-- AlterTable
ALTER TABLE `password_entries` DROP COLUMN `cipherText`,
    DROP COLUMN `group`,
    DROP COLUMN `notes`,
    DROP COLUMN `title`,
    DROP COLUMN `url`,
    DROP COLUMN `username`,
    ADD COLUMN `envelope` TEXT NOT NULL;

-- AlterTable
ALTER TABLE `settings` DROP COLUMN `vaultPasswordHash`,
    ADD COLUMN `vaultKdfIterations` INTEGER NULL,
    ADD COLUMN `vaultRecoveryWrappedKey` TEXT NULL,
    ADD COLUMN `vaultSalt` TEXT NULL,
    ADD COLUMN `vaultWrappedKey` TEXT NULL;

-- CreateTable
CREATE TABLE `agents` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL DEFAULT 'anthropic',
    `baseUrl` VARCHAR(191) NULL,
    `tokenCipher` TEXT NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `agents_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `agents` ADD CONSTRAINT `agents_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
