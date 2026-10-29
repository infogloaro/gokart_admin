-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('ORDER_PAYMENT', 'COD_COLLECTION', 'REFUND', 'VENDOR_SETTLEMENT', 'PARTNER_EARNINGS', 'PAYOUT_HISTORY', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('UPI', 'CARD', 'COD', 'NET_BANKING', 'WALLET', 'BANK_TRANSFER', 'STORE_CREDIT');

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "transactionCode" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "counterparty" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "commissionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deliveryFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transaction_workspaceId_createdAt_idx" ON "Transaction"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_workspaceId_type_idx" ON "Transaction"("workspaceId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_workspaceId_transactionCode_key" ON "Transaction"("workspaceId", "transactionCode");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
