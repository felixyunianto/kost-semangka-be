-- AlterTable
ALTER TABLE "payments" ADD COLUMN "pay_token" VARCHAR(64);

UPDATE "payments"
SET "pay_token" = replace(gen_random_uuid()::text, '-', '')
WHERE "pay_token" IS NULL;

ALTER TABLE "payments" ALTER COLUMN "pay_token" SET NOT NULL;

CREATE UNIQUE INDEX "payments_pay_token_key" ON "payments"("pay_token");
