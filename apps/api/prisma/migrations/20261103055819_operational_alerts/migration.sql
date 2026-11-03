-- CreateEnum
CREATE TYPE "AlertKind" AS ENUM ('delayed_order', 'payment_failed', 'vendor_issue', 'security');

-- CreateTable
CREATE TABLE "operational_alerts" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "AlertKind" NOT NULL,
    "business" "Business",
    "zoneId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "operational_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operational_alerts_key_key" ON "operational_alerts"("key");

-- CreateIndex
CREATE INDEX "operational_alerts_business_resolvedAt_createdAt_idx" ON "operational_alerts"("business", "resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "operational_alerts_zoneId_resolvedAt_idx" ON "operational_alerts"("zoneId", "resolvedAt");
