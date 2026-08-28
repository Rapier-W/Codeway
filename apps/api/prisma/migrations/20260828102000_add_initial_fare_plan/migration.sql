ALTER TABLE "trips" ADD COLUMN "initialFarePlan" JSONB;

-- Existing trips that already expose a feePlan are recovered by the prior
-- revision backfill; this column is only a pre-formation proposal for new trips.
