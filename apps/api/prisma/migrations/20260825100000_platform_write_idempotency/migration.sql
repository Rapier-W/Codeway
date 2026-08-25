ALTER TABLE "RideRecord" ADD COLUMN "requestKey" TEXT;
CREATE UNIQUE INDEX "RideRecord_requestKey_key" ON "RideRecord"("requestKey");
ALTER TABLE "VehicleUpdate" ADD COLUMN "requestKey" TEXT;
CREATE UNIQUE INDEX "VehicleUpdate_requestKey_key" ON "VehicleUpdate"("requestKey");
ALTER TABLE "EmergencyContact" ADD COLUMN "requestKey" TEXT;
CREATE UNIQUE INDEX "EmergencyContact_requestKey_key" ON "EmergencyContact"("requestKey");
