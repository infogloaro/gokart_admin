CREATE TABLE "notification_activity_reads" (
    "memberId" TEXT NOT NULL,
    "activityKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_activity_reads_pkey" PRIMARY KEY ("memberId", "activityKey")
);

CREATE INDEX "notification_activity_reads_memberId_readAt_idx" ON "notification_activity_reads"("memberId", "readAt");

ALTER TABLE "notification_activity_reads" ADD CONSTRAINT "notification_activity_reads_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
