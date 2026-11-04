-- CreateEnum
CREATE TYPE "RiderTicketStatus" AS ENUM ('open', 'resolved');

-- CreateEnum
CREATE TYPE "CodStatus" AS ENUM ('collected', 'handed_over');

-- CreateTable
CREATE TABLE "rider_support_tickets" (
    "id" TEXT NOT NULL,
    "boyId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "RiderTicketStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "rider_support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_support_messages" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromRole" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cod_collections" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "boyId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" "CodStatus" NOT NULL DEFAULT 'collected',
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handedOverAt" TIMESTAMP(3),
    "confirmedById" TEXT,

    CONSTRAINT "cod_collections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rider_support_tickets_boyId_status_idx" ON "rider_support_tickets"("boyId", "status");

-- CreateIndex
CREATE INDEX "rider_support_tickets_status_updatedAt_idx" ON "rider_support_tickets"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "rider_support_messages_ticketId_createdAt_idx" ON "rider_support_messages"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "cod_collections_orderId_key" ON "cod_collections"("orderId");

-- CreateIndex
CREATE INDEX "cod_collections_boyId_status_idx" ON "cod_collections"("boyId", "status");

-- CreateIndex
CREATE INDEX "cod_collections_zoneId_status_idx" ON "cod_collections"("zoneId", "status");

-- AddForeignKey
ALTER TABLE "rider_support_tickets" ADD CONSTRAINT "rider_support_tickets_boyId_fkey" FOREIGN KEY ("boyId") REFERENCES "delivery_boys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_support_messages" ADD CONSTRAINT "rider_support_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "rider_support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cod_collections" ADD CONSTRAINT "cod_collections_boyId_fkey" FOREIGN KEY ("boyId") REFERENCES "delivery_boys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
