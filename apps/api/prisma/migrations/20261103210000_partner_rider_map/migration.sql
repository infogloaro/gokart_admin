-- CreateTable
CREATE TABLE "partner_rider_maps" (
    "partnerId" TEXT NOT NULL,
    "fleetId" TEXT NOT NULL,
    "boyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_rider_maps_pkey" PRIMARY KEY ("partnerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_rider_maps_fleetId_key" ON "partner_rider_maps"("fleetId");

-- CreateIndex
CREATE UNIQUE INDEX "partner_rider_maps_boyId_key" ON "partner_rider_maps"("boyId");

-- AddForeignKey
ALTER TABLE "partner_rider_maps" ADD CONSTRAINT "partner_rider_maps_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
