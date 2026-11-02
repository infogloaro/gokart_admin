CREATE TABLE "partner_drafts" (
    "memberId" TEXT NOT NULL,
    "encryptedData" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_drafts_pkey" PRIMARY KEY ("memberId")
);

ALTER TABLE "partner_drafts" ADD CONSTRAINT "partner_drafts_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
