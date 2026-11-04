-- A surge rule can now cover a whole state or district, not only one zone.
ALTER TABLE "surge_rules" ADD COLUMN "state" TEXT,
ADD COLUMN "districtId" TEXT;

DROP INDEX "surge_rules_active_business_zoneId_idx";
CREATE INDEX "surge_rules_active_business_state_districtId_zoneId_idx" ON "surge_rules"("active", "business", "state", "districtId", "zoneId");

ALTER TABLE "surge_rules" ADD CONSTRAINT "surge_rules_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
