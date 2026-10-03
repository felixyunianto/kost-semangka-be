-- CreateEnum
CREATE TYPE "LateFeeType" AS ENUM ('FIXED', 'PERCENTAGE');

-- AlterTable
ALTER TABLE "bills" ADD COLUMN     "late_fee_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "property_settings" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "late_fee_enabled" BOOLEAN NOT NULL DEFAULT false,
    "late_fee_type" "LateFeeType" NOT NULL DEFAULT 'FIXED',
    "late_fee_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "late_fee_grace_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "property_settings_propertyId_key" ON "property_settings"("propertyId");

-- AddForeignKey
ALTER TABLE "property_settings" ADD CONSTRAINT "property_settings_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
