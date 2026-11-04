-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('offered', 'accepted', 'declined', 'expired', 'withdrawn');

-- CreateEnum
CREATE TYPE "AreaStatus" AS ENUM ('requested', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveryOtpHash" TEXT,
ADD COLUMN     "otpVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "proofAt" TIMESTAMP(3),
ADD COLUMN     "proofContentType" TEXT,
ADD COLUMN     "proofKey" TEXT;

-- CreateTable
CREATE TABLE "delivery_offers" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "boyId" TEXT NOT NULL,
    "fleetId" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'offered',
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "declineReason" TEXT,

    CONSTRAINT "delivery_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_boy_areas" (
    "id" TEXT NOT NULL,
    "boyId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "status" "AreaStatus" NOT NULL DEFAULT 'requested',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,

    CONSTRAINT "delivery_boy_areas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_offers_orderId_status_idx" ON "delivery_offers"("orderId", "status");

-- CreateIndex
CREATE INDEX "delivery_offers_boyId_status_idx" ON "delivery_offers"("boyId", "status");

-- CreateIndex
CREATE INDEX "delivery_offers_status_expiresAt_idx" ON "delivery_offers"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "delivery_boy_areas_zoneId_status_idx" ON "delivery_boy_areas"("zoneId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_boy_areas_boyId_zoneId_key" ON "delivery_boy_areas"("boyId", "zoneId");

-- AddForeignKey
ALTER TABLE "delivery_offers" ADD CONSTRAINT "delivery_offers_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_offers" ADD CONSTRAINT "delivery_offers_boyId_fkey" FOREIGN KEY ("boyId") REFERENCES "delivery_boys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_boy_areas" ADD CONSTRAINT "delivery_boy_areas_boyId_fkey" FOREIGN KEY ("boyId") REFERENCES "delivery_boys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_boy_areas" ADD CONSTRAINT "delivery_boy_areas_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
