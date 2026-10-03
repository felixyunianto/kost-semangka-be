-- AlterTable
ALTER TABLE "finance_entries" ADD COLUMN "occupantId" UUID;

-- CreateIndex
CREATE INDEX "finance_entries_occupantId_idx" ON "finance_entries"("occupantId");

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_occupantId_fkey" FOREIGN KEY ("occupantId") REFERENCES "occupants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
