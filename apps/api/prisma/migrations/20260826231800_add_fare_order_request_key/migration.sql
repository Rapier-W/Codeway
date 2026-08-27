ALTER TABLE "FareOrder" ADD COLUMN "request_key" TEXT;
CREATE UNIQUE INDEX "FareOrder_requestKey_key" ON "FareOrder"("request_key");
ALTER TABLE "FareOrder" ADD COLUMN "source_upload_id" TEXT;
CREATE UNIQUE INDEX "FareOrder_sourceUploadId_key" ON "FareOrder"("source_upload_id");
