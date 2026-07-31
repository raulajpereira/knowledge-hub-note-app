/*
  Warnings:

  - You are about to drop the column `mandante` on the `sap_systems` table. All the data in the column will be lost.
  - You are about to drop the column `module` on the `sap_systems` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `sap_systems` DROP COLUMN `mandante`,
    DROP COLUMN `module`,
    ADD COLUMN `applicationServer` VARCHAR(191) NULL,
    ADD COLUMN `instanceNumber` VARCHAR(191) NULL,
    ADD COLUMN `saprouter` TEXT NULL;
