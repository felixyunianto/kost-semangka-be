-- AlterTable
ALTER TABLE "payments" ADD COLUMN "last_charged_at" TIMESTAMP(3);

-- CreateEnum
CREATE TYPE "PaymentChargeStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'FAILED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "payment_charges" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "gateway_reference" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "qrCode" TEXT,
    "expired_at" TIMESTAMP(3),
    "status" "PaymentChargeStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_charges_pkey" PRIMARY KEY ("id")
);

-- Backfill
INSERT INTO "payment_charges" ("id", "paymentId", "gateway_reference", "amount", "qrCode", "expired_at", "status", "created_at")
SELECT
    gen_random_uuid(),
    p."id",
    p."gatewayReference",
    p."amount",
    p."qrCode",
    p."expiredAt",
    CASE
        WHEN p."status"::text IN ('PAID', 'EXPIRED', 'FAILED') THEN p."status"::text::"PaymentChargeStatus"
        ELSE 'PENDING'::"PaymentChargeStatus"
    END,
    p."createdAt"
FROM "payments" p
WHERE p."gatewayReference" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "payment_charges_gateway_reference_key" ON "payment_charges"("gateway_reference");

-- CreateIndex
CREATE INDEX "payment_charges_paymentId_idx" ON "payment_charges"("paymentId");

-- AddForeignKey
ALTER TABLE "payment_charges" ADD CONSTRAINT "payment_charges_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
