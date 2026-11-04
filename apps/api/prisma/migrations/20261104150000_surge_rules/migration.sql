-- CreateEnum
CREATE TYPE "SurgeKind" AS ENUM ('peak', 'night', 'rain', 'festival', 'custom');

-- CreateTable
CREATE TABLE "surge_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SurgeKind" NOT NULL,
    "business" "Business",
    "zoneId" TEXT,
    "multiplierPercent" INTEGER NOT NULL,
    "maxExtraPaise" INTEGER,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "days" INTEGER[],
    "startsOn" DATE,
    "endsOn" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "surge_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "surge_rules_active_business_zoneId_idx" ON "surge_rules"("active", "business", "zoneId");

-- AddForeignKey
ALTER TABLE "surge_rules" ADD CONSTRAINT "surge_rules_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
