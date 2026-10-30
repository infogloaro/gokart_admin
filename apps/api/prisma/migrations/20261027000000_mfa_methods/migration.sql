-- Sign-in with email or mobile number, and a choice of second step (email, SMS, authenticator app).

-- CreateEnum
CREATE TYPE "MfaMethod" AS ENUM ('email', 'sms', 'totp');

-- AlterTable
ALTER TABLE "members" ADD COLUMN     "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preferredMfa" "MfaMethod" NOT NULL DEFAULT 'email';

-- CreateIndex
CREATE UNIQUE INDEX "members_phone_key" ON "members"("phone");
