ALTER TABLE "object_uploads"
ADD COLUMN "declared_size_bytes" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "object_uploads"
ADD CONSTRAINT "object_uploads_declared_size_bytes_check"
CHECK ("declared_size_bytes" >= 1 AND "declared_size_bytes" <= 10485760);
