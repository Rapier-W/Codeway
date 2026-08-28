-- Older applied installations may carry the legacy CONFIRMED default.  New
-- snapshots must always start pending; an explicit insert is the only way to
-- mark a member as confirmed.
ALTER TABLE "fare_plan_confirmations"
  ALTER COLUMN "status" SET DEFAULT 'PENDING';
