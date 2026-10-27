-- AlterEnum
ALTER TYPE "AccountType" ADD VALUE 'vendor';

-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN     "upiId" TEXT;

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "category" TEXT,
ADD COLUMN     "launchPreference" TEXT,
ADD COLUMN     "ownerPhone" TEXT,
ADD COLUMN     "pan" TEXT,
ADD COLUMN     "pinCode" TEXT,
ADD COLUMN     "settlementCycle" TEXT;
