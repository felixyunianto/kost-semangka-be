-- DropForeignKey
ALTER TABLE "finance_entries" DROP CONSTRAINT "finance_entries_occupantId_fkey";

-- DropIndex
DROP INDEX "finance_entries_occupantId_idx";

-- AlterTable
ALTER TABLE "finance_entries" DROP COLUMN "occupantId";
