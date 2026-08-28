CREATE TABLE "fare_plan_idempotency_keys" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "request_fingerprint" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fare_plan_idempotency_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fare_plan_idempotency_keys_key_key" ON "fare_plan_idempotency_keys"("key");
CREATE INDEX "fare_plan_idempotency_keys_trip_id_user_id_idx" ON "fare_plan_idempotency_keys"("trip_id", "user_id");
