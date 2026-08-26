export const OBJECT_STORAGE_PROVIDER = Symbol('OBJECT_STORAGE_PROVIDER');

export interface ObjectMetadata {
  key: string;
  mimeType: string;
  sizeBytes: number;
}

export interface UploadGrant {
  objectKey: string;
  uploadUrl: string;
  uploadToken: string;
  expiresAt: Date;
}

export interface ObjectStorageProvider {
  createUploadGrant(input: {
    key: string;
    mimeType: string;
    maxSizeBytes: number;
    expiresAt: Date;
  }): Promise<UploadGrant>;
  statObject(key: string): Promise<ObjectMetadata | null>;
  createPrivateDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
}
