-- CreateEnum
CREATE TYPE "InventoryCondition" AS ENUM ('GOOD', 'FAIR', 'POOR');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('FUNCTIONAL', 'REPAIRING');

-- CreateTable
CREATE TABLE "room_inventories" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "condition" "InventoryCondition" NOT NULL,
    "status" "InventoryStatus" NOT NULL DEFAULT 'FUNCTIONAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "room_inventories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_inventories_roomId_idx" ON "room_inventories"("roomId");

-- CreateIndex
CREATE INDEX "room_inventories_status_idx" ON "room_inventories"("status");

-- CreateIndex
CREATE INDEX "room_inventories_condition_idx" ON "room_inventories"("condition");

-- AddForeignKey
ALTER TABLE "room_inventories" ADD CONSTRAINT "room_inventories_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing facility names as working inventory in good condition
INSERT INTO "room_inventories" ("id", "roomId", "name", "condition", "status", "created_at", "updated_at")
SELECT
    gen_random_uuid(),
    r.id,
    TRIM(facility),
    'GOOD',
    'FUNCTIONAL',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "rooms" r
CROSS JOIN LATERAL unnest(r.facilities) AS facility
WHERE TRIM(facility) <> '';

-- AlterTable
ALTER TABLE "rooms" DROP COLUMN "facilities";
