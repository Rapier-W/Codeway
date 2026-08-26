import { ObjectStorageProvider, UploadGrant, ObjectMetadata } from './object-storage.provider';

export class UnconfiguredObjectStorageProvider implements ObjectStorageProvider {
  private fail(): never { throw new Error('STORAGE_NOT_CONFIGURED'); }
  async createUploadGrant(_input: { key: string; mimeType: string; maxSizeBytes: number; expiresAt: Date }): Promise<UploadGrant> { this.fail(); }
  async statObject(_key: string): Promise<ObjectMetadata | null> { this.fail(); }
  async createPrivateDownloadUrl(_key: string, _expiresInSeconds: number): Promise<string> { this.fail(); }
  async deleteObject(_key: string): Promise<void> { this.fail(); }
}
