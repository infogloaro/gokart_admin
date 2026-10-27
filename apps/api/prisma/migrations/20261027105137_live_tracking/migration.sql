-- AlterTable
ALTER TABLE "zones" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "partner_locations" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "speedKmh" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partner_locations_partnerId_at_idx" ON "partner_locations"("partnerId", "at");
