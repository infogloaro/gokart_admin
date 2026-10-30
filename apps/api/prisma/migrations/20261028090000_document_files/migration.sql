-- AlterTable
ALTER TABLE "partner_documents" ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "sizeBytes" INTEGER;

-- AlterTable
ALTER TABLE "vendor_documents" ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "sizeBytes" INTEGER;
