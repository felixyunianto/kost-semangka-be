-- CreateEnum
CREATE TYPE "FinanceType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FinanceCategory" AS ENUM (
  'DEPOSIT',
  'PARKING',
  'FINE',
  'OTHER_INCOME',
  'UTILITIES',
  'MAINTENANCE',
  'SALARY',
  'SUPPLIES',
  'TAX',
  'MARKETING',
  'OTHER_EXPENSE'
);

-- CreateTable
CREATE TABLE "finance_entries" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "type" "FinanceType" NOT NULL,
    "category" "FinanceCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "occurred_at" DATE NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "finance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finance_entries_propertyId_idx" ON "finance_entries"("propertyId");

-- CreateIndex
CREATE INDEX "finance_entries_type_idx" ON "finance_entries"("type");

-- CreateIndex
CREATE INDEX "finance_entries_category_idx" ON "finance_entries"("category");

-- CreateIndex
CREATE INDEX "finance_entries_occurred_at_idx" ON "finance_entries"("occurred_at");

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
