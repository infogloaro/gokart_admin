-- CreateEnum
CREATE TYPE "VendorApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DeliveryPartnerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PLACED', 'PREPARING', 'ON_THE_WAY', 'DELIVERED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "RefundCaseStatus" AS ENUM ('PENDING', 'ESCALATED', 'RESOLVED');

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "approvalStatus" "VendorApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPartner" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "DeliveryPartnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "vendorId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PLACED',
    "grossValue" DECIMAL(12,2) NOT NULL,
    "platformRevenue" DECIMAL(12,2) NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "rating" INTEGER,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundCase" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "orderId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "RefundCaseStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerDocument" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "deliveryPartnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vendor_workspaceId_idx" ON "Vendor"("workspaceId");

-- CreateIndex
CREATE INDEX "Vendor_workspaceId_approvalStatus_idx" ON "Vendor"("workspaceId", "approvalStatus");

-- CreateIndex
CREATE INDEX "DeliveryPartner_workspaceId_idx" ON "DeliveryPartner"("workspaceId");

-- CreateIndex
CREATE INDEX "DeliveryPartner_workspaceId_status_idx" ON "DeliveryPartner"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Order_workspaceId_placedAt_idx" ON "Order"("workspaceId", "placedAt");

-- CreateIndex
CREATE INDEX "Order_workspaceId_status_idx" ON "Order"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Order_workspaceId_orderNumber_key" ON "Order"("workspaceId", "orderNumber");

-- CreateIndex
CREATE INDEX "Complaint_workspaceId_idx" ON "Complaint"("workspaceId");

-- CreateIndex
CREATE INDEX "Complaint_workspaceId_status_idx" ON "Complaint"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "RefundCase_workspaceId_idx" ON "RefundCase"("workspaceId");

-- CreateIndex
CREATE INDEX "RefundCase_workspaceId_status_idx" ON "RefundCase"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "PartnerDocument_workspaceId_idx" ON "PartnerDocument"("workspaceId");

-- CreateIndex
CREATE INDEX "PartnerDocument_workspaceId_expiresAt_idx" ON "PartnerDocument"("workspaceId", "expiresAt");

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPartner" ADD CONSTRAINT "DeliveryPartner_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundCase" ADD CONSTRAINT "RefundCase_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundCase" ADD CONSTRAINT "RefundCase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerDocument" ADD CONSTRAINT "PartnerDocument_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerDocument" ADD CONSTRAINT "PartnerDocument_deliveryPartnerId_fkey" FOREIGN KEY ("deliveryPartnerId") REFERENCES "DeliveryPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
