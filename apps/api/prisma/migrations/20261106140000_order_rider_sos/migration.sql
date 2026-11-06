-- A rider who cannot continue (accident, breakdown) raises an SOS on the order; a replacement is found.
ALTER TABLE "orders" ADD COLUMN "sosAt" TIMESTAMP(3),
ADD COLUMN "sosReason" TEXT,
ADD COLUMN "sosLat" DOUBLE PRECISION,
ADD COLUMN "sosLng" DOUBLE PRECISION;
