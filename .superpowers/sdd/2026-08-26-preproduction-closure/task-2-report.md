# Task 2 report — fare-plan revision workflow

## Status

Implemented the fare-plan revision/change-request domain in the isolated worktree.

## Changes

- Added Prisma models and migration `20260828100000_add_fare_plan_workflow` for immutable revisions, confirmations, change requests and member-snapshot decisions.
- Added partial unique index allowing at most one pending request per trip, plus idempotency uniqueness.
- Added `FarePlanService` transaction paths for member authorization, creator-only requests, 24-hour expiry, rejection, snapshot membership checks, atomic supersede/apply, re-confirmation and Trip row locks.
- Added HTTP routes under `/trips/:tripId/fare-plan`, `/trips/:tripId/fare-plan-change-requests`, `/fare-plan-change-requests/:id/decisions`, and revision confirmation.
- Added deterministic normalization and largest-remainder settlement helper.
- Added audit records for request creation and successful application where the audit model is available.

## Verification

- `npm test -- --runInBand src/fare/fare-plan.service.spec.ts` — 1 suite, 2 tests passed.
- `npx prisma validate` — schema valid.
- `npx prisma migrate deploy` — both fare-plan migration and separate backfill migration applied successfully to local PostgreSQL (`localhost:5433/tongluxing`).
- `npx tsc --noEmit --pretty false` — passed.
- `git diff --check` — passed (line-ending warnings only).

## Concerns / follow-up

- Full HTTP PostgreSQL E2E for 3/4-member workflows remains to be added in the parent integration task.
- Prisma client generation may require network access to Prisma binaries in a clean environment; schema validation and TypeScript compilation pass with the existing client.
- A separate best-effort backfill migration preserves existing non-null `Trip.feePlan` rows on fresh databases without changing the checksum of the primary migration.
