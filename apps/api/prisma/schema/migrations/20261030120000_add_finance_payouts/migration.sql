-- CreateEnum
CREATE TYPE "PayoutKind" AS ENUM ('PARTNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'PAID', 'SETTLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RemittanceMethod" AS ENUM ('CASH_DEPOSIT', 'UPI', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "AdjustmentKind" AS ENUM ('BONUS', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "DeliveryPartner" ADD COLUMN     "accountCode" TEXT,
ADD COLUMN     "adminId" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "feeSharePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "fixedPay" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "monthlySalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "perDeliveryRate" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'UPI';

-- CreateTable
CREATE TABLE "AdminAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "monthlySalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "incentiveAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "onTimeThreshold" DECIMAL(5,2) NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerRemittance" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "RemittanceMethod" NOT NULL,
    "note" TEXT,
    "remittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerRemittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayAdjustment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "partnerId" TEXT,
    "adminId" TEXT,
    "kind" "AdjustmentKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "PayoutKind" NOT NULL,
    "partnerId" TEXT,
    "adminId" TEXT,
    "cycle" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "note" TEXT NOT NULL DEFAULT 'System · auto settlement',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayChangeRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "proposedMonthlySalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "proposedFixedPay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "proposedPerDelivery" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "proposedFeeShare" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "PayChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAccount_workspaceId_idx" ON "AdminAccount"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminAccount_workspaceId_accountCode_key" ON "AdminAccount"("workspaceId", "accountCode");

-- CreateIndex
CREATE INDEX "PartnerRemittance_workspaceId_remittedAt_idx" ON "PartnerRemittance"("workspaceId", "remittedAt");

-- CreateIndex
CREATE INDEX "PartnerRemittance_partnerId_idx" ON "PartnerRemittance"("partnerId");

-- CreateIndex
CREATE INDEX "PayAdjustment_workspaceId_createdAt_idx" ON "PayAdjustment"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Payout_workspaceId_cycle_idx" ON "Payout"("workspaceId", "cycle");

-- CreateIndex
CREATE INDEX "Payout_workspaceId_status_idx" ON "Payout"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_workspaceId_code_key" ON "Payout"("workspaceId", "code");

-- CreateIndex
CREATE INDEX "PayChangeRequest_workspaceId_status_idx" ON "PayChangeRequest"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayChangeRequest_workspaceId_code_key" ON "PayChangeRequest"("workspaceId", "code");

-- CreateIndex
CREATE INDEX "FinanceAuditLog_createdAt_idx" ON "FinanceAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "AdminAccount" ADD CONSTRAINT "AdminAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerRemittance" ADD CONSTRAINT "PartnerRemittance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerRemittance" ADD CONSTRAINT "PartnerRemittance_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "DeliveryPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayAdjustment" ADD CONSTRAINT "PayAdjustment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayAdjustment" ADD CONSTRAINT "PayAdjustment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "DeliveryPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayAdjustment" ADD CONSTRAINT "PayAdjustment_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "DeliveryPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayChangeRequest" ADD CONSTRAINT "PayChangeRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayChangeRequest" ADD CONSTRAINT "PayChangeRequest_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "DeliveryPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayChangeRequest" ADD CONSTRAINT "PayChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "AdminAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPartner" ADD CONSTRAINT "DeliveryPartner_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

