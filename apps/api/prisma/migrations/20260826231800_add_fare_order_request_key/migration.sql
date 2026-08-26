ALTER TABLE "FareOrder" ADD COLUMN "request_key" TEXT;
CREATE UNIQUE INDEX "FareOrder_requestKey_key" ON "FareOrder"("request_key");
