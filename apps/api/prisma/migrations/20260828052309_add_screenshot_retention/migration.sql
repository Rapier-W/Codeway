-- AlterTable
ALTER TABLE "FareDispute" ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "FareOrder" ADD COLUMN     "retentionDeleteAfter" TIMESTAMP(3),
ADD COLUMN     "screenshotDeletedAt" TIMESTAMP(3);
