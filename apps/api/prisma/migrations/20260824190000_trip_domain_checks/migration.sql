-- Domain integrity checks for the trip vertical slice.
-- This migration is intentionally SQL because Prisma 5 does not expose
-- PostgreSQL CHECK constraints in schema.prisma.

ALTER TABLE "trips"
  ADD CONSTRAINT "trips_capacity_check"
  CHECK ("capacity" IN (3, 4));

ALTER TABLE "trips"
  ADD CONSTRAINT "trips_status_check"
  CHECK ("status" IN (
    'RECRUITING', 'CONFIRMING', 'FORMED', 'WAITING_RIDE', 'RIDE_BOOKED',
    'PENDING_SETTLEMENT', 'ORDER_DISPUTED', 'SETTLED', 'PENDING_REVIEW', 'ARCHIVED'
  ));

ALTER TABLE "trip_members"
  ADD CONSTRAINT "trip_members_role_check"
  CHECK ("role" IN ('CREATOR', 'MEMBER'));

ALTER TABLE "trip_members"
  ADD CONSTRAINT "trip_members_member_count_check"
  CHECK ("memberCount" IN (1, 2));

ALTER TABLE "trip_confirmations"
  ADD CONSTRAINT "trip_confirmations_status_check"
  CHECK ("status" IN ('CONFIRMED', 'VOID'));

ALTER TABLE "recommendation_decisions"
  ADD CONSTRAINT "recommendation_decisions_reasons_check"
  CHECK (
    COALESCE(array_length("reasons", 1), 0) <= 3
    AND "reasons" <@ ARRAY['TIME_CLOSE', 'RELIABLE', 'VERIFIED', 'OPEN_SLOT']::text[]
  );
