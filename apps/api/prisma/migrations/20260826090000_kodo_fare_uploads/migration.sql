CREATE TABLE "object_uploads" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "allowed_mime_type" TEXT NOT NULL,
    "max_size_bytes" INTEGER NOT NULL,
    "request_key" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "claimed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "object_uploads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "object_uploads_object_key_key" ON "object_uploads"("object_key");
CREATE UNIQUE INDEX "object_uploads_request_key_key" ON "object_uploads"("request_key");
CREATE INDEX "object_uploads_expires_at_claimed_at_deleted_at_idx" ON "object_uploads"("expires_at", "claimed_at", "deleted_at");

ALTER TABLE "object_uploads" ADD CONSTRAINT "object_uploads_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
