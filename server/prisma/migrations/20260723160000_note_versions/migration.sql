-- CreateTable
CREATE TABLE `note_versions` (
    `id` VARCHAR(191) NOT NULL,
    `noteId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` LONGTEXT NOT NULL,
    `blocks` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `note_versions_noteId_createdAt_idx`(`noteId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `note_versions` ADD CONSTRAINT `note_versions_noteId_fkey` FOREIGN KEY (`noteId`) REFERENCES `notes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
