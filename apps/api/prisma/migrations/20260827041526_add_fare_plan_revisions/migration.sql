-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_userId_fkey";

-- AlterTable
ALTER TABLE "object_uploads" ALTER COLUMN "declared_size_bytes" DROP DEFAULT;

-- CreateTable
CREATE TABLE "fare_plan_revisions" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "allocations" JSONB,
    "amountCents" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fare_plan_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fare_plan_confirmations" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestKey" TEXT,

    CONSTRAINT "fare_plan_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fare_plan_change_requests" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "requestKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fare_plan_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fare_plan_change_decisions" (
    "id" TEXT NOT NULL,
    "changeRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "requestKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fare_plan_change_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fare_plan_revisions_tripId_idx" ON "fare_plan_revisions"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "fare_plan_confirmations_requestKey_key" ON "fare_plan_confirmations"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "fare_plan_confirmations_revisionId_userId_key" ON "fare_plan_confirmations"("revisionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "fare_plan_change_requests_requestKey_key" ON "fare_plan_change_requests"("requestKey");

-- CreateIndex
CREATE INDEX "fare_plan_change_requests_tripId_idx" ON "fare_plan_change_requests"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "fare_plan_change_decisions_requestKey_key" ON "fare_plan_change_decisions"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "fare_plan_change_decisions_changeRequestId_userId_key" ON "fare_plan_change_decisions"("changeRequestId", "userId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fare_plan_revisions" ADD CONSTRAINT "fare_plan_revisions_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fare_plan_confirmations" ADD CONSTRAINT "fare_plan_confirmations_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "fare_plan_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fare_plan_change_requests" ADD CONSTRAINT "fare_plan_change_requests_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fare_plan_change_requests" ADD CONSTRAINT "fare_plan_change_requests_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "fare_plan_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fare_plan_change_decisions" ADD CONSTRAINT "fare_plan_change_decisions_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "fare_plan_change_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fare_plan_change_decisions" ADD CONSTRAINT "fare_plan_change_decisions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "FareOrder_requestKey_key" RENAME TO "FareOrder_request_key_key";

-- RenameIndex
ALTER INDEX "FareOrder_sourceUploadId_key" RENAME TO "FareOrder_source_upload_id_key";
