ALTER TABLE "FareOrder" ADD COLUMN "retention_delete_after" TIMESTAMP(3);
ALTER TABLE "FareOrder" ADD COLUMN "screenshot_deleted_at" TIMESTAMP(3);
ALTER TABLE "FareDispute" ADD COLUMN "resolved_at" TIMESTAMP(3);
ALTER TABLE "FareDispute" ADD COLUMN "resolution" TEXT;

CREATE INDEX "FareOrder_retention_delete_after_screenshot_deleted_at_idx"
  ON "FareOrder"("retention_delete_after", "screenshot_deleted_at");
