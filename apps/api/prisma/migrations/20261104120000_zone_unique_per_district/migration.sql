-- District names repeat across Indian states (e.g. Aurangabad), so a zone is unique within its
-- district record, not by the district's name text.
DROP INDEX "zones_district_city_location_key";
CREATE UNIQUE INDEX "zones_districtId_city_location_key" ON "zones"("districtId", "city", "location");
