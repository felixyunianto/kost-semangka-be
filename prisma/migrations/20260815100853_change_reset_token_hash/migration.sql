/*
  Warnings:

  - You are about to drop the column `resetToken` on the `password_reset_tokens` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "password_reset_tokens" DROP COLUMN "resetToken",
ADD COLUMN     "resetTokenHash" TEXT;
