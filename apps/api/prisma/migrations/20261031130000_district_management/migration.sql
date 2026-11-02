CREATE TABLE "districts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

INSERT INTO "districts" ("id", "code", "name", "state", "updatedAt")
SELECT
    'district_' || md5(district_key),
    upper(left(regexp_replace(district_name, '[^A-Za-z0-9]', '', 'g'), 8))
        || '-' || upper(left(md5(district_key), 8)),
    district_name,
    'Tamil Nadu',
    CURRENT_TIMESTAMP
FROM (
    SELECT lower(btrim("district")) AS district_key, min(btrim("district")) AS district_name
    FROM "zones"
    GROUP BY lower(btrim("district"))
) AS source_districts;

CREATE UNIQUE INDEX "districts_code_key" ON "districts"("code");
CREATE UNIQUE INDEX "districts_state_name_key" ON "districts"("state", "name");

ALTER TABLE "zones" ADD COLUMN "districtId" TEXT;

UPDATE "zones" AS zone
SET "districtId" = district."id"
FROM "districts" AS district
WHERE lower(btrim(zone."district")) = lower(district."name")
  AND district."state" = 'Tamil Nadu';

ALTER TABLE "zones" ALTER COLUMN "districtId" SET NOT NULL;

CREATE INDEX "zones_districtId_idx" ON "zones"("districtId");

ALTER TABLE "zones" ADD CONSTRAINT "zones_districtId_fkey"
FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
