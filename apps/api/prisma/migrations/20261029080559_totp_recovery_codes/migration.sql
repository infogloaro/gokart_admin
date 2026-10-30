-- AlterTable
ALTER TABLE "members" ADD COLUMN     "totpLastStep" INTEGER;

-- CreateTable
CREATE TABLE "member_recovery_codes" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_recovery_codes_memberId_codeHash_key" ON "member_recovery_codes"("memberId", "codeHash");

-- AddForeignKey
ALTER TABLE "member_recovery_codes" ADD CONSTRAINT "member_recovery_codes_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
