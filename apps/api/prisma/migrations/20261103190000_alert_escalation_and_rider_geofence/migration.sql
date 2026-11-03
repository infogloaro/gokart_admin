-- AlterEnum: riders who drift away from their zone
ALTER TYPE "AlertKind" ADD VALUE 'rider_off_zone';

-- When a delayed-order alert was passed on to Super Admins
ALTER TABLE "operational_alerts" ADD COLUMN "escalatedAt" TIMESTAMP(3);
