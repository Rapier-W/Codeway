ALTER TABLE "trips" ADD COLUMN "createRequestKey" TEXT;
CREATE UNIQUE INDEX "trips_createRequestKey_key" ON "trips"("createRequestKey");
