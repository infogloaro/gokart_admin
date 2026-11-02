CREATE TABLE "delivery_fleet_businesses" (
    "fleetId" TEXT NOT NULL,
    "business" "Business" NOT NULL,

    CONSTRAINT "delivery_fleet_businesses_pkey" PRIMARY KEY ("fleetId", "business")
);

INSERT INTO "delivery_fleet_businesses" ("fleetId", "business")
SELECT "id", business
FROM "delivery_fleets"
CROSS JOIN (VALUES ('food'::"Business"), ('mart'::"Business")) AS businesses(business);

ALTER TABLE "delivery_fleet_businesses"
ADD CONSTRAINT "delivery_fleet_businesses_fleetId_fkey"
FOREIGN KEY ("fleetId") REFERENCES "delivery_fleets"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
