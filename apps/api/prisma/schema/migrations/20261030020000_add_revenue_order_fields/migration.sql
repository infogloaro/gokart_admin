-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'PENDING', 'REFUNDED', 'FAILED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "commissionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "customerName" TEXT NOT NULL DEFAULT 'Walk-in customer',
ADD COLUMN     "deliveryFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryPartnerId" TEXT,
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING';

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryPartnerId_fkey" FOREIGN KEY ("deliveryPartnerId") REFERENCES "DeliveryPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
