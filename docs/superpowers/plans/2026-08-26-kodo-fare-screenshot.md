# Kodo 私有桶费用截图闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a trip creator to upload one verified fare screenshot to a private Kodo bucket, bind it safely to a fare order, and let only trip members obtain a short-lived viewing URL.

**Architecture:** NestJS issues one-time upload intents persisted in PostgreSQL and delegates storage actions to an `ObjectStorageProvider`. The Web app pre-validates the file then uploads direct to the provider and sends only the upload intent ID when creating the order. The API verifies provider metadata before atomically consuming the intent and exposes member-authorized short-lived downloads.

**Tech Stack:** NestJS 10, TypeScript, Prisma/PostgreSQL, Jest/Supertest, Vue 3/Vite/Vant/Pinia/PWA, Qiniu Kodo Node SDK, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-26-kodo-fare-screenshot-design.md`

## Global Constraints

- Kodo bucket is private; do not expose permanent object URLs or object-storage credentials to Web/PWA.
- Allow only `image/jpeg`, `image/png`, `image/webp`; each file must be at most `10 * 1024 * 1024` bytes.
- Object keys are API generated as `fare-screenshots/{userId}/{tripId}/{uuid}.{ext}` and upload credentials expire after 10 minutes.
- Only a creator of a `RIDE_BOOKED` or `PENDING_SETTLEMENT` trip may issue or consume a screenshot upload; only trip members may obtain a 60-second download URL.
- The order API accepts `screenshotUploadId` and `actualTotalFareCents`; do not accept browser-supplied object keys, MIME data or byte size as order truth.
- Write no AK/SK, bucket value, Kodo token, Cookie or real image into Git. Production storage misconfiguration must fail closed.
- Do not add Redis, public CDN delivery, OCR, image transformation, student-evidence or report-evidence upload in this change.
- All mutation endpoints require a valid `Idempotency-Key`; same key with different actor, trip or payload returns a conflict.
- Test providers must be explicit fakes; their passing tests do not constitute a live Kodo verification.

---

## File Structure

- Create `apps/api/src/storage/object-storage.provider.ts`: provider interface and shared metadata/token types.
- Create `apps/api/src/storage/in-memory-object-storage.provider.ts`: deterministic test and development fake with explicit upload simulation helpers.
- Create `apps/api/src/storage/kodo-object-storage.provider.ts`: private Kodo implementation using only server environment values.
- Create `apps/api/src/storage/storage.module.ts`: chooses Kodo only when complete configuration exists, otherwise a fail-closed provider in production and an explicit fake in tests.
- Create `apps/api/src/storage/storage.service.spec.ts`: provider boundary, expiry, metadata, private URL and deletion tests.
- Create `apps/api/src/fare/dto/create-fare-screenshot-upload.dto.ts`: create-intent DTO.
- Modify `apps/api/prisma/schema.prisma`: add `ObjectUpload` and its relations/indexes.
- Create `apps/api/prisma/migrations/20260826090000_kodo_fare_uploads/migration.sql`: `object_uploads` table, checks, FKs, indexes and unique request key.
- Modify `apps/api/src/fare/dto/create-fare-order.dto.ts`: replace client object metadata with `screenshotUploadId`.
- Modify `apps/api/src/fare/fare.service.ts` and `apps/api/src/fare/fare.controller.ts`: create upload intent, verify/consume it during order creation, issue member-private URL, and clean stale unclaimed objects.
- Modify `apps/api/src/fare/fare.module.ts` and `apps/api/src/app.module.ts`: import storage providers and schedule cleanup without introducing an external queue.
- Modify `apps/api/src/fare/fare.service.spec.ts`: unit coverage for intent authorization, validation, claim races, metadata mismatch and download authorization.
- Modify `apps/api/test/postgres-http.e2e-spec.ts`: true PostgreSQL HTTP closure with injected explicit Fake provider.
- Modify `apps/api/.env.example`: add blank Kodo object-storage variable names only.
- Modify `apps/web/src/api/contracts.ts`, `apps/web/src/api/http-client.ts`, and `apps/web/src/api/mock-client.ts`: typed upload-intent, direct-upload and screenshot-read client contract.
- Modify `apps/web/src/views/OrderView.vue`: file selection, validation, upload/submit state, retry and screenshot display entry.
- Create `apps/web/src/views/OrderView.spec.ts`: UI validation, upload retry, successful submit and view authorization-state tests.
- Modify `apps/web/api-contract.md`, `TEAM-TASKS.md`, and `docs/07-系统架构方案.md`: record the Web/PWA baseline and the verified Kodo boundary without real credentials.

## Task 1: Storage boundary and database persistence

**Files:**
- Create: `apps/api/src/storage/object-storage.provider.ts`
- Create: `apps/api/src/storage/in-memory-object-storage.provider.ts`
- Create: `apps/api/src/storage/kodo-object-storage.provider.ts`
- Create: `apps/api/src/storage/storage.module.ts`
- Create: `apps/api/src/storage/storage.service.spec.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260826090000_kodo_fare_uploads/migration.sql`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Produces `ObjectStorageProvider` with `createUploadGrant(input)`, `statObject(key)`, `createPrivateDownloadUrl(key, expiresInSeconds)` and `deleteObject(key)`.
- Produces Prisma model `ObjectUpload { id, purpose, provider, objectKey, tripId, ownerId, allowedMimeType, maxSizeBytes, requestKey, expiresAt, claimedAt, deletedAt, createdAt }`.
- Consumes no fare behavior; later tasks receive `OBJECT_STORAGE_PROVIDER` and `PrismaService.objectUpload`.

- [ ] **Step 1: Write failing provider and schema tests**

Add `apps/api/src/storage/storage.service.spec.ts` with a fake provider contract:

```ts
it('creates a single-key grant and does not expose secrets', async () => {
  const grant = await provider.createUploadGrant({
    key: 'fare-screenshots/u1/t1/a.png', mimeType: 'image/png', maxSizeBytes: 1024, expiresAt,
  });
  expect(grant.objectKey).toBe('fare-screenshots/u1/t1/a.png');
  expect(grant.expiresAt).toEqual(expiresAt);
  expect(JSON.stringify(grant)).not.toMatch(/secret|accessKey/i);
});

it('rejects expired grants and deletes missing objects idempotently', async () => {
  await expect(provider.putForTest(expiredGrant, pngBytes)).rejects.toThrow('UPLOAD_GRANT_EXPIRED');
  await expect(provider.deleteObject('fare-screenshots/u1/t1/missing.png')).resolves.toBeUndefined();
});
```

Write `20260826090000_kodo_fare_uploads/migration.sql` with `object_key TEXT NOT NULL UNIQUE`, `request_key TEXT NOT NULL UNIQUE`, a foreign key from `trip_id` to `trips(id)`, and `CREATE INDEX "object_uploads_expires_at_claimed_at_deleted_at_idx" ON "object_uploads"("expires_at", "claimed_at", "deleted_at")`; then use `npx prisma validate` to ensure the Prisma model declares the same unique fields and index.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- storage.service.spec.ts --runInBand` from `apps/api`.

Expected: FAIL because `../storage/object-storage.provider` and the fake provider do not exist.

- [ ] **Step 3: Implement the provider and migration minimally**

Define the exact provider contract:

```ts
export interface ObjectMetadata { key: string; mimeType: string; sizeBytes: number }
export interface UploadGrant { objectKey: string; uploadUrl: string; uploadToken: string; expiresAt: Date }
export interface ObjectStorageProvider {
  createUploadGrant(input: { key: string; mimeType: string; maxSizeBytes: number; expiresAt: Date }): Promise<UploadGrant>;
  statObject(key: string): Promise<ObjectMetadata | null>;
  createPrivateDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
}
```

Install the official `qiniu` SDK as an API runtime dependency. Configure Kodo with `QINIU_KODO_BUCKET`, `QINIU_KODO_UPLOAD_HOST`, `QINIU_KODO_ACCESS_KEY`, and `QINIU_KODO_SECRET_KEY`; create upload policies scoped to exactly one `bucket:key`, one allowed MIME type and `fsizeLimit`. Add `ObjectUpload` with `@@unique([objectKey])`, `@@unique([requestKey])`, `@@index([expiresAt, claimedAt, deletedAt])`, plus the `Trip` relation. Generate a SQL migration with equivalent foreign key and indexes. Register storage module in `AppModule` without registering an unauthenticated controller.

- [ ] **Step 4: Run provider, schema and build verification**

Run from `apps/api`:

```powershell
npm test -- storage.service.spec.ts --runInBand
npx prisma generate
npx prisma validate
npm run build
```

Expected: provider tests pass; Prisma client generation/validation and Nest build exit `0`.

- [ ] **Step 5: Commit the storage foundation**

```powershell
git add apps/api/package.json apps/api/package-lock.json apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/storage apps/api/src/app.module.ts
git commit -m "codex: add private object storage boundary"
```

## Task 2: Issue controlled fare screenshot upload intents

**Files:**
- Create: `apps/api/src/fare/dto/create-fare-screenshot-upload.dto.ts`
- Modify: `apps/api/src/fare/fare.controller.ts`
- Modify: `apps/api/src/fare/fare.service.ts`
- Modify: `apps/api/src/fare/fare.module.ts`
- Modify: `apps/api/src/fare/fare.service.spec.ts`

**Interfaces:**
- Consumes `ObjectStorageProvider.createUploadGrant` and `PrismaService.objectUpload` from Task 1.
- Produces `FareService.createScreenshotUpload(tripId, userId, dto, idempotencyKey): Promise<{ uploadId: string; objectKey: string; uploadUrl: string; uploadToken: string; expiresAt: string }>`.
- Produces `POST /trips/:id/fare-screenshot-uploads`.

- [ ] **Step 1: Add failing upload-intent tests**

Extend `fare.service.spec.ts` with:

```ts
it('allows only the creator of a ride-booked trip to obtain a PNG upload intent', async () => {
  tx.trip.findUnique.mockResolvedValue({ id: 't1', creatorId: 'u1', status: 'RIDE_BOOKED', disputeLocked: false, members: [] });
  const result = await service.createScreenshotUpload('t1', 'u1', { mimeType: 'image/png', sizeBytes: 100 }, 'intent-1');
  expect(result.objectKey).toMatch(/^fare-screenshots\/u1\/t1\//);
  expect(storage.createUploadGrant).toHaveBeenCalledWith(expect.objectContaining({ mimeType: 'image/png', maxSizeBytes: 10 * 1024 * 1024 }));
});

it('rejects a member, GIF, an 11MB file, locked trip and mismatched idempotency reuse', async () => {
  await expect(service.createScreenshotUpload('t1', 'u2', { mimeType: 'image/png', sizeBytes: 100 }, 'intent-2')).rejects.toBeInstanceOf(ForbiddenException);
  await expect(service.createScreenshotUpload('t1', 'u1', { mimeType: 'image/gif', sizeBytes: 100 }, 'intent-3')).rejects.toBeInstanceOf(BadRequestException);
});
```

Add controller tests asserting absent/invalid `Idempotency-Key` returns `400` and the response never contains Kodo AK/SK fields.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- fare.service.spec.ts --runInBand` from `apps/api`.

Expected: FAIL because `createScreenshotUpload` and its DTO/route do not exist.

- [ ] **Step 3: Implement upload-intent issuance**

Create DTO fields `mimeType` and `sizeBytes` with class-validator `@IsIn(['image/jpeg', 'image/png', 'image/webp'])`, `@IsInt()`, `@Min(1)`, and `@Max(10 * 1024 * 1024)`. In a transaction, lock the trip, require `trip.creatorId === userId`, require status `RIDE_BOOKED` or `PENDING_SETTLEMENT`, reject `disputeLocked`, read `objectUpload` by `requestKey`, compare its trip, owner, MIME and declared bytes, then return it only if unclaimed and unexpired. Otherwise create exactly one 10-minute intent, call provider grant creation, write an audit event `fare-screenshot-upload-intent`, and return only the public grant fields.

Wire controller signature:

```ts
@Post('trips/:id/fare-screenshot-uploads')
createScreenshotUpload(@Param('id') tripId: string, @CurrentUserId() userId: string,
  @Body() dto: CreateFareScreenshotUploadDto, @IdempotencyKey() key: string) {
  return this.fare.createScreenshotUpload(tripId, userId, dto, key);
}
```

- [ ] **Step 4: Run focused test and API build**

Run from `apps/api`:

```powershell
npm test -- fare.service.spec.ts --runInBand
npm run build
```

Expected: all fare service tests pass; build exits `0`.

- [ ] **Step 5: Commit controlled intent issuance**

```powershell
git add apps/api/src/fare
git commit -m "codex: issue constrained fare screenshot uploads"
```

## Task 3: Verify and consume uploads, provide private reads and clean orphans

**Files:**
- Modify: `apps/api/src/fare/dto/create-fare-order.dto.ts`
- Modify: `apps/api/src/fare/fare.controller.ts`
- Modify: `apps/api/src/fare/fare.service.ts`
- Modify: `apps/api/src/fare/fare.service.spec.ts`
- Modify: `apps/api/test/postgres-http.e2e-spec.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Consumes `ObjectUpload`, `ObjectStorageProvider.statObject`, `ObjectStorageProvider.createPrivateDownloadUrl`, and `ObjectStorageProvider.deleteObject`.
- Changes `CreateFareOrderDto` to `{ screenshotUploadId: string; actualTotalFareCents: number }`.
- Produces `FareService.getScreenshotUrl(fareOrderId, userId): Promise<{ url: string; expiresAt: string }>` and `FareService.cleanupExpiredUploads(now: Date): Promise<number>`.
- Produces `GET /fare-orders/:id/screenshot`.

- [ ] **Step 1: Write failing order-binding, download and cleanup tests**

Replace direct client-metadata setup in `fare.service.spec.ts` with:

```ts
it('uses provider metadata rather than submitted browser metadata when binding the order', async () => {
  tx.objectUpload.findUnique.mockResolvedValue(activeUpload);
  storage.statObject.mockResolvedValue({ key: activeUpload.objectKey, mimeType: 'image/png', sizeBytes: 512 });
  await service.createOrder('t1', 'u1', { screenshotUploadId: activeUpload.id, actualTotalFareCents: 1200 });
  expect(tx.fareOrder.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ screenshotKey: activeUpload.objectKey, screenshotSizeBytes: 512 }) }));
  expect(tx.objectUpload.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ claimedAt: null }) }));
});

it('rejects expired, claimed or metadata-mismatched uploads without writing an order', async () => {
  storage.statObject.mockResolvedValue({ key: activeUpload.objectKey, mimeType: 'image/webp', sizeBytes: 512 });
  await expect(service.createOrder('t1', 'u1', { screenshotUploadId: activeUpload.id, actualTotalFareCents: 1200 })).rejects.toBeInstanceOf(BadRequestException);
  expect(tx.fareOrder.create).not.toHaveBeenCalled();
});

it('issues a 60-second read URL only to a trip member and deletes only unclaimed expired uploads', async () => {
  await expect(service.getScreenshotUrl('fo1', 'outsider')).rejects.toBeInstanceOf(ForbiddenException);
  await service.cleanupExpiredUploads(now);
  expect(storage.deleteObject).toHaveBeenCalledWith('fare-screenshots/u1/t1/expired.png');
});
```

Extend real E2E so it requests an intent, simulates an explicit fake upload, creates the order using `screenshotUploadId`, verifies a member gets a URL, and verifies an outsider receives `403`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- fare.service.spec.ts --runInBand` from `apps/api`.

Expected: FAIL because the DTO still requires `screenshotKey`, provider metadata is unused and screenshot URL/cleanup methods do not exist.

- [ ] **Step 3: Implement secure consume/read/cleanup behavior**

Change the DTO to:

```ts
export class CreateFareOrderDto {
  @IsUUID('4', { message: 'SCREENSHOT_UPLOAD_INVALID' }) screenshotUploadId!: string;
  @IsInt({ message: 'FARE_AMOUNT_INVALID' }) @Min(0, { message: 'FARE_AMOUNT_INVALID' }) actualTotalFareCents!: number;
}
```

In `createOrder`, lock the trip then read the upload intent, require matching `tripId` and `ownerId`, unclaimed and unexpired state, and provider metadata equal to its object key, allowed MIME and valid byte range. Claim using `updateMany({ where: { id, claimedAt: null }, data: { claimedAt: new Date() } })`; require `count === 1` before write. Use the metadata returned by `statObject` for `FareOrder` columns. Add a member-checked screenshot endpoint whose signed URL expiry is exactly 60 seconds. Add an interval service that calls `cleanupExpiredUploads(new Date())` every hour; it must only delete unclaimed, expired, not-deleted records and mark successful deletes. Add blank Kodo variable names to `.env.example`.

- [ ] **Step 4: Execute database and API acceptance**

Run from `apps/api`, with existing local `.env` and `E2E_DATABASE_URL` only:

```powershell
npx prisma migrate deploy
npx prisma validate
npm test -- fare.service.spec.ts --runInBand
npm run test:e2e:postgres
npm run build
```

Expected: both PostgreSQL schemas are migrated by the documented local workflow; focused fare tests, real PostgreSQL HTTP E2E and build pass. Report storage portion as Fake verification when no Kodo credentials are configured.

- [ ] **Step 5: Commit secure order binding**

```powershell
git add apps/api/.env.example apps/api/prisma apps/api/src/fare apps/api/test/postgres-http.e2e-spec.ts
git commit -m "codex: verify and bind private fare screenshots"
```

## Task 4: Web/PWA screenshot interaction and HTTP contract

**Files:**
- Modify: `apps/web/src/api/contracts.ts`
- Modify: `apps/web/src/api/http-client.ts`
- Modify: `apps/web/src/api/http-client.spec.ts`
- Modify: `apps/web/src/api/mock-client.ts`
- Modify: `apps/web/src/views/OrderView.vue`
- Create: `apps/web/src/views/OrderView.spec.ts`

**Interfaces:**
- Consumes `POST /trips/:tripId/fare-screenshot-uploads`, direct multipart upload fields and `POST /trips/:tripId/fare-order` from Tasks 2–3.
- Produces `ApiClient.createFareScreenshotUpload`, `ApiClient.uploadFareScreenshot`, `ApiClient.createFareOrder`, and `ApiClient.getFareScreenshotUrl`.
- Displays only the short-lived URL returned for an authorized current view.

- [ ] **Step 1: Write failing Web contract and view tests**

Add typed client expectations:

```ts
it('creates an upload intent, posts the file directly, then submits only uploadId', async () => {
  await client.submitFareOrder('trip-1', new File(['png'], 'receipt.png', { type: 'image/png' }), 1200, 'order-key');
  expect(fetch).toHaveBeenNthCalledWith(1, '/api/trips/trip-1/fare-screenshot-uploads', expect.anything());
  expect(fetch).toHaveBeenNthCalledWith(3, '/api/trips/trip-1/fare-order', expect.objectContaining({ body: JSON.stringify({ screenshotUploadId: 'upload-1', actualTotalFareCents: 1200 }) }));
});
```

Add `OrderView.spec.ts` cases for GIF rejection, a file greater than 10MB rejection, visible upload failure with retry, disabled submit while uploading, and a short-lived screenshot view button only after order detail load.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- http-client.spec.ts OrderView.spec.ts --run` from `apps/web`.

Expected: FAIL because the API client lacks upload methods and OrderView has no file flow.

- [ ] **Step 3: Implement the typed client and responsive view**

Add types:

```ts
export interface FareScreenshotUpload { uploadId: string; objectKey: string; uploadUrl: string; uploadToken: string; expiresAt: string }
export interface FareScreenshotView { url: string; expiresAt: string }
```

Have `HttpApiClient` request the intent with the normal `Idempotency-Key`, use `FormData` for direct upload without the API authorization header, then create the order with `{ screenshotUploadId, actualTotalFareCents }`. In `OrderView`, use `<input type="file" accept="image/jpeg,image/png,image/webp">`, state labels for selected/uploading/failed/bound, a retry button that obtains a fresh intent, and a 44px-or-larger control area. Never place URL/token/object key in Pinia or browser storage. Use `getFareScreenshotUrl(orderId)` only on user action and open it in a new tab with `noopener,noreferrer`.

- [ ] **Step 4: Run Web acceptance**

Run from `apps/web`:

```powershell
npm test -- --run
npm run typecheck
npm run build
```

Expected: all Vitest suites pass, typecheck exits `0`, and PWA production build completes.

- [ ] **Step 5: Commit the Web screenshot flow**

```powershell
git add apps/web/src/api apps/web/src/views/OrderView.vue apps/web/src/views/OrderView.spec.ts
git commit -m "codex: add fare screenshot upload flow"
```

## Task 5: Review, documentation and release verification

**Files:**
- Modify: `apps/web/api-contract.md`
- Modify: `docs/07-系统架构方案.md`
- Modify: `TEAM-TASKS.md`

**Interfaces:**
- Consumes all completed HTTP interfaces and migration from Tasks 1–4.
- Produces an accurate implementation boundary, especially whether Kodo was verified with Fake only or real credentials.

- [ ] **Step 1: Add failing/document consistency checks**

Before editing documentation, run a repository scan that must find no production credential values and no obsolete order request examples:

```powershell
git grep -nE 'screenshotKey.*mimeType|screenshotKey.*sizeBytes' -- apps/web apps/api/src docs
git grep -nE 'QINIU_KODO_(ACCESS_KEY|SECRET_KEY)=.+[^[:space:]]' -- ':!apps/api/.env.example'
```

Expected: the first command lists only migration/internal persistence references, not Web request payloads or API DTO examples; the second command has no output.

- [ ] **Step 2: Run the checks and record any failure**

Run the two commands above before changing docs.

Expected: if a stale API payload or real credential is reported, the task remains failing until it is removed from the code/documentation scope.

- [ ] **Step 3: Update documentation with verified boundaries**

Document the three endpoints, 10-minute upload and 60-second read expiry, member/creator authorization, 10MB and MIME limit, orphan cleanup rule and private-bucket-only policy. Correct the architecture document client baseline to Web/PWA + independent NestJS API. In `TEAM-TASKS.md`, append the exact test commands/results, migration names, reviewed files and the statement “Kodo behavior validated with Fake” unless a separate live credential run has evidence.

- [ ] **Step 4: Run full final verification and independent review**

Run:

```powershell
Set-Location apps/api; npx prisma validate; npm test -- --runInBand; npm run test:e2e:postgres; npm run build
Set-Location ../web; npm test -- --run; npm run typecheck; npm run build
Set-Location ../..; git diff --check; git status --short
```

Have Reasonix independently review authentication, private-object authorization, migration and error handling. Have Kimi independently review cross-file implementation and run the API/Web test commands. Codex must inspect both diffs and rerun the final commands before marking the task complete.

- [ ] **Step 5: Commit verified docs and integration record**

```powershell
git add apps/web/api-contract.md docs/07-系统架构方案.md TEAM-TASKS.md
git commit -m "codex: document Kodo screenshot integration"
```
