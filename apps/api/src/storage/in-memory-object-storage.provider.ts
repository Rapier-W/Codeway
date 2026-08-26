import { ObjectMetadata, ObjectStorageProvider, UploadGrant } from './object-storage.provider';

export class InMemoryObjectStorageProvider implements ObjectStorageProvider {
  private readonly grants = new Map<string, UploadGrant>();
  private readonly objects = new Map<string, ObjectMetadata>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async createUploadGrant(input: { key: string; mimeType: string; maxSizeBytes: number; expiresAt: Date }): Promise<UploadGrant> {
    const grant = { objectKey: input.key, uploadUrl: `memory://${input.key}`, uploadToken: `memory-${input.key}`, expiresAt: input.expiresAt };
    this.grants.set(grant.uploadToken, grant);
    return grant;
  }

  async putForTest(grant: UploadGrant, bytes: Buffer): Promise<void> {
    if (grant.expiresAt <= this.now()) throw new Error('UPLOAD_GRANT_EXPIRED');
    if (bytes.length > Number.MAX_SAFE_INTEGER) throw new Error('UPLOAD_TOO_LARGE');
    this.objects.set(grant.objectKey, { key: grant.objectKey, mimeType: 'application/octet-stream', sizeBytes: bytes.length });
  }

  async statObject(key: string): Promise<ObjectMetadata | null> { return this.objects.get(key) ?? null; }
  async createPrivateDownloadUrl(key: string, expiresInSeconds: number): Promise<string> { return `memory://${key}?expires=${expiresInSeconds}`; }
  async deleteObject(key: string): Promise<void> { this.objects.delete(key); }
}
