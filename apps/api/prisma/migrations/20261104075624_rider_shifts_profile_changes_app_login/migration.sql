-- CreateEnum
CREATE TYPE "ProfileChangeStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "delivery_boys" ADD COLUMN     "appPasswordHash" TEXT,
ADD COLUMN     "appPasswordSetAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "rider_shifts" (
    "id" TEXT NOT NULL,
    "boyId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endedById" TEXT,

    CONSTRAINT "rider_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_profile_changes" (
    "id" TEXT NOT NULL,
    "boyId" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "status" "ProfileChangeStatus" NOT NULL DEFAULT 'pending',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "reason" TEXT,

    CONSTRAINT "rider_profile_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rider_shifts_boyId_endedAt_idx" ON "rider_shifts"("boyId", "endedAt");

-- CreateIndex
CREATE INDEX "rider_shifts_endedAt_startedAt_idx" ON "rider_shifts"("endedAt", "startedAt");

-- CreateIndex
CREATE INDEX "rider_profile_changes_status_requestedAt_idx" ON "rider_profile_changes"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "rider_profile_changes_boyId_status_idx" ON "rider_profile_changes"("boyId", "status");

-- AddForeignKey
ALTER TABLE "rider_shifts" ADD CONSTRAINT "rider_shifts_boyId_fkey" FOREIGN KEY ("boyId") REFERENCES "delivery_boys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_profile_changes" ADD CONSTRAINT "rider_profile_changes_boyId_fkey" FOREIGN KEY ("boyId") REFERENCES "delivery_boys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
