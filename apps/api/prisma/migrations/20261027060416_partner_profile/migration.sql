-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN     "bankName" TEXT;

-- AlterTable
ALTER TABLE "partners" ADD COLUMN     "address" TEXT,
ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "licenceValidUntil" DATE,
ADD COLUMN     "pinCode" TEXT,
ADD COLUMN     "vehicleModel" TEXT;
