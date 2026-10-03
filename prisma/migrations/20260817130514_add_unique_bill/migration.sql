/*
  Warnings:

  - Added the required column `check_in` to the `occupants` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "RentalType" AS ENUM ('MONTHLY', 'DAILY');

-- CreateEnum
CREATE TYPE "BillType" AS ENUM ('RENT', 'MANUAL', 'BOOKING');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('QRIS', 'VA', 'EWALLET', 'BANK_TRANSFER', 'MANUAL');

-- DropIndex
DROP INDEX "public"."occupants_email_idx";

-- AlterTable
ALTER TABLE "occupants" ADD COLUMN     "check_in" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "check_out" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "rental_type" "RentalType" NOT NULL DEFAULT 'MONTHLY';

-- CreateTable
CREATE TABLE "bills" (
    "id" UUID NOT NULL,
    "occupantId" UUID,
    "bookingId" UUID,
    "invoice_number" VARCHAR(50) NOT NULL,
    "type" "BillType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "period_start" DATE,
    "period_end" DATE,
    "due_date" DATE,
    "description" VARCHAR(255),
    "status" "BillStatus" NOT NULL DEFAULT 'UNPAID',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "billId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "transaction_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bills_invoice_number_key" ON "bills"("invoice_number");

-- CreateIndex
CREATE INDEX "bills_occupantId_idx" ON "bills"("occupantId");

-- CreateIndex
CREATE INDEX "bills_bookingId_idx" ON "bills"("bookingId");

-- CreateIndex
CREATE INDEX "bills_status_idx" ON "bills"("status");

-- CreateIndex
CREATE INDEX "bills_type_idx" ON "bills"("type");

-- CreateIndex
CREATE INDEX "bills_due_date_idx" ON "bills"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "bills_occupantId_type_period_start_period_end_key" ON "bills"("occupantId", "type", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "payments_transaction_id_key" ON "payments"("transaction_id");

-- CreateIndex
CREATE INDEX "payments_billId_idx" ON "payments"("billId");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_paid_at_idx" ON "payments"("paid_at");

-- CreateIndex
CREATE INDEX "occupants_is_active_idx" ON "occupants"("is_active");

-- CreateIndex
CREATE INDEX "occupants_check_in_idx" ON "occupants"("check_in");

-- CreateIndex
CREATE INDEX "occupants_check_out_idx" ON "occupants"("check_out");

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_occupantId_fkey" FOREIGN KEY ("occupantId") REFERENCES "occupants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
