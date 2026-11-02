-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "district" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "DeliveryPartner" ADD COLUMN     "district" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "district" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "AdminAccount" ADD COLUMN     "district" TEXT,
ADD COLUMN     "state" TEXT;

-- CreateIndex
CREATE INDEX "Vendor_workspaceId_state_district_idx" ON "Vendor"("workspaceId", "state", "district");

-- CreateIndex
CREATE INDEX "DeliveryPartner_workspaceId_state_district_idx" ON "DeliveryPartner"("workspaceId", "state", "district");

-- CreateIndex
CREATE INDEX "Order_workspaceId_state_district_idx" ON "Order"("workspaceId", "state", "district");

-- CreateIndex
CREATE INDEX "AdminAccount_workspaceId_state_district_idx" ON "AdminAccount"("workspaceId", "state", "district");
