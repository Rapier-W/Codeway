-- Add explicit membership lifecycle fields without changing existing active members.
ALTER TABLE "trip_members"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "decisionRequestKey" TEXT,
  ADD COLUMN "decisionAction" TEXT,
  ADD COLUMN "decisionActorId" TEXT;

UPDATE "trip_members"
SET "acceptedAt" = "joinedAt"
WHERE "status" = 'ACTIVE' AND "acceptedAt" IS NULL;

CREATE UNIQUE INDEX "trip_members_decisionRequestKey_key"
  ON "trip_members"("decisionRequestKey");
