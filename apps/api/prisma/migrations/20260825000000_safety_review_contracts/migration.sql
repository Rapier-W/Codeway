ALTER TABLE "SosEvent" ADD COLUMN "note" TEXT;
ALTER TABLE "SosEvent" ADD COLUMN "requestKey" TEXT;
CREATE UNIQUE INDEX "SosEvent_requestKey_key" ON "SosEvent"("requestKey");
ALTER TABLE "Review" ADD COLUMN "requestKey" TEXT;
CREATE UNIQUE INDEX "Review_requestKey_key" ON "Review"("requestKey");
