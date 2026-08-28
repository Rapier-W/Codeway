CREATE TABLE "fare_plan_revisions" (
  "id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "plan" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMP(3),
  "superseded_at" TIMESTAMP(3),
  CONSTRAINT "fare_plan_revisions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "fare_plan_confirmations" (
  "id" TEXT NOT NULL,
  "revision_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "idempotency_key" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "voided_at" TIMESTAMP(3),
  CONSTRAINT "fare_plan_confirmations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "fare_plan_change_requests" (
  "id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "base_revision_id" TEXT NOT NULL,
  "proposed_plan" JSONB NOT NULL,
  "reason" TEXT,
  "requested_by" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "request_key" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "applied_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fare_plan_change_requests_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "fare_plan_change_decisions" (
  "id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "decision" TEXT NOT NULL DEFAULT 'PENDING',
  "decided_at" TIMESTAMP(3),
  "idempotency_key" TEXT,
  CONSTRAINT "fare_plan_change_decisions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fare_plan_revisions_trip_id_sequence_key" ON "fare_plan_revisions"("trip_id", "sequence");
CREATE INDEX "fare_plan_revisions_trip_id_status_idx" ON "fare_plan_revisions"("trip_id", "status");
CREATE UNIQUE INDEX "fare_plan_confirmations_revision_id_user_id_key" ON "fare_plan_confirmations"("revision_id", "user_id");
CREATE UNIQUE INDEX "fare_plan_confirmations_idempotency_key_key" ON "fare_plan_confirmations"("idempotency_key");
CREATE UNIQUE INDEX "fare_plan_change_requests_request_key_key" ON "fare_plan_change_requests"("request_key");
CREATE INDEX "fare_plan_change_requests_trip_id_status_idx" ON "fare_plan_change_requests"("trip_id", "status");
CREATE UNIQUE INDEX "fare_plan_change_decisions_request_id_user_id_key" ON "fare_plan_change_decisions"("request_id", "user_id");
CREATE UNIQUE INDEX "fare_plan_change_decisions_idempotency_key_key" ON "fare_plan_change_decisions"("idempotency_key");
CREATE UNIQUE INDEX "fare_plan_change_requests_trip_pending_key" ON "fare_plan_change_requests"("trip_id") WHERE "status" = 'PENDING';
ALTER TABLE "fare_plan_revisions" ADD CONSTRAINT "fare_plan_revisions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fare_plan_confirmations" ADD CONSTRAINT "fare_plan_confirmations_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "fare_plan_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fare_plan_confirmations" ADD CONSTRAINT "fare_plan_confirmations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fare_plan_change_requests" ADD CONSTRAINT "fare_plan_change_requests_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fare_plan_change_requests" ADD CONSTRAINT "fare_plan_change_requests_base_revision_id_fkey" FOREIGN KEY ("base_revision_id") REFERENCES "fare_plan_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fare_plan_change_requests" ADD CONSTRAINT "fare_plan_change_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fare_plan_change_decisions" ADD CONSTRAINT "fare_plan_change_decisions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "fare_plan_change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fare_plan_change_decisions" ADD CONSTRAINT "fare_plan_change_decisions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
