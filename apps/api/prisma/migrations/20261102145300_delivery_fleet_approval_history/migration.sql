-- AlterEnum
ALTER TYPE "DeliveryBoyAvailability" ADD VALUE 'on_break';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DeliveryFleetStatus" ADD VALUE 'pending_approval';
ALTER TYPE "DeliveryFleetStatus" ADD VALUE 'rejected';

-- DropIndex
DROP INDEX "complaints_deliveryFleetId_idx";

-- DropIndex
DROP INDEX "complaints_responsibleAdminId_idx";

-- DropIndex
DROP INDEX "orders_deliveryBoyId_idx";

-- DropIndex
DROP INDEX "orders_deliveryFleetId_idx";

-- AlterTable
ALTER TABLE "delivery_fleets" ADD COLUMN     "requestedById" TEXT,
ADD COLUMN     "requestedByName" TEXT,
ADD COLUMN     "requestedZoneIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "status" SET DEFAULT 'pending_approval';

-- CreateTable
CREATE TABLE "delivery_history" (
    "id" TEXT NOT NULL,
    "fleetId" TEXT,
    "boyId" TEXT,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "changes" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_history_fleetId_at_idx" ON "delivery_history"("fleetId", "at");

-- CreateIndex
CREATE INDEX "delivery_history_boyId_at_idx" ON "delivery_history"("boyId", "at");

-- AddForeignKey
ALTER TABLE "delivery_history" ADD CONSTRAINT "delivery_history_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "delivery_fleets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_history" ADD CONSTRAINT "delivery_history_boyId_fkey" FOREIGN KEY ("boyId") REFERENCES "delivery_boys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
