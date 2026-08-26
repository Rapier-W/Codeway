import { ObjectMetadata, ObjectStorageProvider, UploadGrant } from './object-storage.provider';

export class InMemoryObjectStorageProvider implements ObjectStorageProvider {
  private readonly grants = new Map<string, UploadGrant>();
  private readonly grantConstraints = new Map<string, { objectKey: string; expiresAt: Date; mimeType: string; maxSizeBytes: number }>();
  private readonly objects = new Map<string, ObjectMetadata>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async createUploadGrant(input: { key: string; mimeType: string; maxSizeBytes: number; expiresAt: Date }): Promise<UploadGrant> {
    const grant = { objectKey: input.key, uploadUrl: `memory://${input.key}`, uploadToken: `memory-${input.key}`, expiresAt: input.expiresAt };
    this.grants.set(grant.uploadToken, grant);
    this.grantConstraints.set(grant.uploadToken, { objectKey: grant.objectKey, expiresAt: grant.expiresAt, mimeType: input.mimeType, maxSizeBytes: input.maxSizeBytes });
    return grant;
  }

  async putForTest(grant: UploadGrant, bytes: Buffer, mimeType?: string): Promise<void> {
    if (grant.expiresAt <= this.now()) throw new Error('UPLOAD_GRANT_EXPIRED');
    const constraints = this.grantConstraints.get(grant.uploadToken);
    if (!constraints || constraints.objectKey !== grant.objectKey || constraints.expiresAt.getTime() !== grant.expiresAt.getTime()) throw new Error('UPLOAD_GRANT_INVALID');
    if (bytes.length > constraints.maxSizeBytes) throw new Error('UPLOAD_TOO_LARGE');
    if (mimeType !== constraints.mimeType) throw new Error('UPLOAD_MIME_TYPE_NOT_ALLOWED');
    this.objects.set(grant.objectKey, { key: grant.objectKey, mimeType, sizeBytes: bytes.length });
  }

  async statObject(key: string): Promise<ObjectMetadata | null> { return this.objects.get(key) ?? null; }
  async createPrivateDownloadUrl(key: string, expiresInSeconds: number): Promise<string> { return `memory://${key}?expires=${expiresInSeconds}`; }
  async deleteObject(key: string): Promise<void> { this.objects.delete(key); }
}
