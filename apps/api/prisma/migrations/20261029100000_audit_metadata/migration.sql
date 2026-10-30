ALTER TABLE "audit_logs"
ADD COLUMN "actorRole" TEXT,
ADD COLUMN "source" TEXT,
ADD COLUMN "userAgent" TEXT;
