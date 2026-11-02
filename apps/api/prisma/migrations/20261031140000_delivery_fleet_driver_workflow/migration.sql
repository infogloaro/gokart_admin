CREATE TYPE "DeliveryFleetStatus" AS ENUM ('active', 'suspended');
CREATE TYPE "DeliveryBoyStatus" AS ENUM ('pending_admin', 'pending_super', 'corrections_requested', 'rejected', 'active', 'suspended');
CREATE TYPE "DeliveryBoyAvailability" AS ENUM ('available', 'on_delivery', 'offline', 'suspended');
CREATE TYPE "DeliveryBoyReviewDecision" AS ENUM ('submitted', 'corrections_resubmitted', 'forwarded', 'corrections_requested', 'rejected', 'approved', 'suspended', 'reactivated');
CREATE TYPE "DeliveryAssignmentStatus" AS ENUM ('assigned', 'accepted', 'rejected', 'completed', 'cancelled');

CREATE TABLE "delivery_fleets" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "contactPerson" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "credentialHash" TEXT,
    "credentialIssuedAt" TIMESTAMP(3),
    "status" "DeliveryFleetStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "delivery_fleets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_fleet_zones" (
    "id" TEXT NOT NULL,
    "fleetId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "notes" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "delivery_fleet_zones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_boys" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fleetId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "vehicleNumber" TEXT NOT NULL,
    "status" "DeliveryBoyStatus" NOT NULL DEFAULT 'pending_admin',
    "availability" "DeliveryBoyAvailability" NOT NULL DEFAULT 'offline',
    "maxActiveOrders" INTEGER NOT NULL DEFAULT 1,
    "reviewAdminId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "delivery_boys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_boy_documents" (
    "id" TEXT NOT NULL,
    "boyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    CONSTRAINT "delivery_boy_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_boy_reviews" (
    "id" TEXT NOT NULL,
    "boyId" TEXT NOT NULL,
    "actorId" TEXT,
    "fleetId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "decision" "DeliveryBoyReviewDecision" NOT NULL,
    "from" "DeliveryBoyStatus" NOT NULL,
    "to" "DeliveryBoyStatus" NOT NULL,
    "reason" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "delivery_boy_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_boy_notifications" (
    "id" TEXT NOT NULL,
    "boyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "delivery_boy_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_assignments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fleetId" TEXT NOT NULL,
    "boyId" TEXT NOT NULL,
    "assignedById" TEXT,
    "status" "DeliveryAssignmentStatus" NOT NULL DEFAULT 'assigned',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "reason" TEXT,
    CONSTRAINT "delivery_assignments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "orders" ADD COLUMN "deliveryFleetId" TEXT;
ALTER TABLE "orders" ADD COLUMN "deliveryBoyId" TEXT;

ALTER TABLE "complaints" ADD COLUMN "sourceApplication" TEXT NOT NULL DEFAULT 'support';
ALTER TABLE "complaints" ADD COLUMN "reporterRole" TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE "complaints" ADD COLUMN "reporterId" TEXT;
ALTER TABLE "complaints" ADD COLUMN "responsibleAdminId" TEXT;
ALTER TABLE "complaints" ADD COLUMN "deliveryFleetId" TEXT;

CREATE UNIQUE INDEX "delivery_fleets_code_key" ON "delivery_fleets"("code");
CREATE UNIQUE INDEX "delivery_fleets_phone_key" ON "delivery_fleets"("phone");
CREATE UNIQUE INDEX "delivery_fleets_credentialHash_key" ON "delivery_fleets"("credentialHash");
CREATE INDEX "delivery_fleets_districtId_status_idx" ON "delivery_fleets"("districtId", "status");

CREATE INDEX "delivery_fleet_zones_zoneId_endedAt_idx" ON "delivery_fleet_zones"("zoneId", "endedAt");
CREATE INDEX "delivery_fleet_zones_fleetId_endedAt_idx" ON "delivery_fleet_zones"("fleetId", "endedAt");
CREATE UNIQUE INDEX "delivery_fleet_zones_one_active_per_zone_key"
    ON "delivery_fleet_zones"("zoneId") WHERE "endedAt" IS NULL;

CREATE UNIQUE INDEX "delivery_boys_code_key" ON "delivery_boys"("code");
CREATE UNIQUE INDEX "delivery_boys_phone_key" ON "delivery_boys"("phone");
CREATE INDEX "delivery_boys_fleetId_status_idx" ON "delivery_boys"("fleetId", "status");
CREATE INDEX "delivery_boys_zoneId_status_availability_idx" ON "delivery_boys"("zoneId", "status", "availability");
CREATE INDEX "delivery_boys_reviewAdminId_status_idx" ON "delivery_boys"("reviewAdminId", "status");

CREATE UNIQUE INDEX "delivery_boy_documents_boyId_kind_key" ON "delivery_boy_documents"("boyId", "kind");
CREATE INDEX "delivery_boy_reviews_boyId_at_idx" ON "delivery_boy_reviews"("boyId", "at");
CREATE INDEX "delivery_boy_reviews_fleetId_at_idx" ON "delivery_boy_reviews"("fleetId", "at");
CREATE INDEX "delivery_boy_notifications_boyId_readAt_createdAt_idx" ON "delivery_boy_notifications"("boyId", "readAt", "createdAt");

CREATE INDEX "delivery_assignments_orderId_assignedAt_idx" ON "delivery_assignments"("orderId", "assignedAt");
CREATE INDEX "delivery_assignments_boyId_status_endedAt_idx" ON "delivery_assignments"("boyId", "status", "endedAt");
CREATE INDEX "delivery_assignments_fleetId_assignedAt_idx" ON "delivery_assignments"("fleetId", "assignedAt");
CREATE UNIQUE INDEX "delivery_assignments_one_open_per_order_key"
    ON "delivery_assignments"("orderId") WHERE "endedAt" IS NULL;

CREATE INDEX "orders_deliveryFleetId_idx" ON "orders"("deliveryFleetId");
CREATE INDEX "orders_deliveryBoyId_idx" ON "orders"("deliveryBoyId");
CREATE INDEX "complaints_responsibleAdminId_idx" ON "complaints"("responsibleAdminId");
CREATE INDEX "complaints_deliveryFleetId_idx" ON "complaints"("deliveryFleetId");

ALTER TABLE "delivery_fleets" ADD CONSTRAINT "delivery_fleets_districtId_fkey"
    FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_fleet_zones" ADD CONSTRAINT "delivery_fleet_zones_fleetId_fkey"
    FOREIGN KEY ("fleetId") REFERENCES "delivery_fleets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_fleet_zones" ADD CONSTRAINT "delivery_fleet_zones_zoneId_fkey"
    FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_fleet_zones" ADD CONSTRAINT "delivery_fleet_zones_assignedById_fkey"
    FOREIGN KEY ("assignedById") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_boys" ADD CONSTRAINT "delivery_boys_fleetId_fkey"
    FOREIGN KEY ("fleetId") REFERENCES "delivery_fleets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_boys" ADD CONSTRAINT "delivery_boys_zoneId_fkey"
    FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_boys" ADD CONSTRAINT "delivery_boys_reviewAdminId_fkey"
    FOREIGN KEY ("reviewAdminId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "delivery_boy_documents" ADD CONSTRAINT "delivery_boy_documents_boyId_fkey"
    FOREIGN KEY ("boyId") REFERENCES "delivery_boys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_boy_reviews" ADD CONSTRAINT "delivery_boy_reviews_boyId_fkey"
    FOREIGN KEY ("boyId") REFERENCES "delivery_boys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_boy_reviews" ADD CONSTRAINT "delivery_boy_reviews_fleetId_fkey"
    FOREIGN KEY ("fleetId") REFERENCES "delivery_fleets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "delivery_boy_notifications" ADD CONSTRAINT "delivery_boy_notifications_boyId_fkey"
    FOREIGN KEY ("boyId") REFERENCES "delivery_boys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_fleetId_fkey"
    FOREIGN KEY ("fleetId") REFERENCES "delivery_fleets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_boyId_fkey"
    FOREIGN KEY ("boyId") REFERENCES "delivery_boys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliveryFleetId_fkey"
    FOREIGN KEY ("deliveryFleetId") REFERENCES "delivery_fleets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliveryBoyId_fkey"
    FOREIGN KEY ("deliveryBoyId") REFERENCES "delivery_boys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_deliveryFleetId_fkey"
    FOREIGN KEY ("deliveryFleetId") REFERENCES "delivery_fleets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
