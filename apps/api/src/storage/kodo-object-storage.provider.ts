import * as qiniu from 'qiniu';
import { ObjectMetadata, ObjectStorageProvider, UploadGrant } from './object-storage.provider';

type KodoConfig = { bucket: string; uploadHost: string; downloadHost: string; accessKey: string; secretKey: string };

export class KodoObjectStorageProvider implements ObjectStorageProvider {
  private readonly mac: qiniu.auth.digest.Mac;
  private readonly bucketManager: qiniu.rs.BucketManager;

  constructor(private readonly config: KodoConfig) {
    this.mac = new qiniu.auth.digest.Mac(config.accessKey, config.secretKey);
    this.bucketManager = new qiniu.rs.BucketManager(this.mac, new qiniu.conf.Config({ useHttpsDomain: config.uploadHost.startsWith('https://') }));
  }

  async createUploadGrant(input: { key: string; mimeType: string; maxSizeBytes: number; expiresAt: Date }): Promise<UploadGrant> {
    const seconds = Math.max(1, Math.ceil((input.expiresAt.getTime() - Date.now()) / 1000));
    const uploadToken = new qiniu.rs.PutPolicy({ scope: `${this.config.bucket}:${input.key}`, expires: seconds, insertOnly: 1, mimeLimit: input.mimeType, fsizeLimit: input.maxSizeBytes }).uploadToken(this.mac);
    return { objectKey: input.key, uploadUrl: this.config.uploadHost, uploadToken, expiresAt: input.expiresAt };
  }

  async statObject(key: string): Promise<ObjectMetadata | null> {
    try {
      const response: any = await this.bucketManager.stat(this.config.bucket, key);
      const data = response.data ?? response;
      return { key, mimeType: data.mimeType ?? 'application/octet-stream', sizeBytes: data.fsize };
    } catch (error: any) {
      if (error?.code === 612 || error?.statusCode === 612) return null;
      throw error;
    }
  }

  async createPrivateDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
    return this.bucketManager.privateDownloadUrl(this.config.downloadHost, key, Math.floor(Date.now() / 1000) + expiresInSeconds);
  }

  async deleteObject(key: string): Promise<void> {
    try { await this.bucketManager.delete(this.config.bucket, key); }
    catch (error: any) { if (error?.code !== 612 && error?.statusCode !== 612) throw error; }
  }
}
