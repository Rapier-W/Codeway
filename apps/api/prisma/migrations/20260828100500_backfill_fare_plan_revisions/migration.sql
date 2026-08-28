-- Preserve trips that already carry a locked feePlan when introducing revisions.
INSERT INTO "fare_plan_revisions" ("id", "trip_id", "sequence", "plan", "status", "locked_at")
SELECT md5(random()::text || clock_timestamp()::text), t."id", 1, t."feePlan", 'LOCKED', COALESCE(t."updatedAt", CURRENT_TIMESTAMP)
FROM "trips" t
WHERE t."feePlan" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "fare_plan_revisions" r WHERE r."trip_id" = t."id");
