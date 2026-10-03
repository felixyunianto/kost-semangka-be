-- AlterTable
ALTER TABLE "rooms" ADD COLUMN "facilities" TEXT[] DEFAULT ARRAY[]::TEXT[];
