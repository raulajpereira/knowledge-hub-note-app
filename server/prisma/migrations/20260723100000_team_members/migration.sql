-- AlterTable
ALTER TABLE `users` ADD COLUMN `teamOwnerId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `users_teamOwnerId_idx` ON `users`(`teamOwnerId`);

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_teamOwnerId_fkey` FOREIGN KEY (`teamOwnerId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
