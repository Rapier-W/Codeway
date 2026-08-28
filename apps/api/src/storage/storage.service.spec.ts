import { InMemoryObjectStorageProvider } from './in-memory-object-storage.provider';
import { KodoObjectStorageProvider } from './kodo-object-storage.provider';
import { createObjectStorageProvider } from './storage.module';

describe('InMemoryObjectStorageProvider', () => {
  const expiresAt = new Date('2099-08-26T10:00:00.000Z');

  it('creates a single-key grant and does not expose secrets', async () => {
    const provider = new InMemoryObjectStorageProvider(() => new Date('2026-08-26T09:00:00.000Z'));

    const grant = await provider.createUploadGrant({
      key: 'fare-screenshots/u1/t1/a.png',
      mimeType: 'image/png',
      maxSizeBytes: 1024,
      expiresAt,
    });

    expect(grant.objectKey).toBe('fare-screenshots/u1/t1/a.png');
    expect(grant.expiresAt).toEqual(expiresAt);
    expect(JSON.stringify(grant)).not.toMatch(/secret|accessKey/i);
  });

  it('rejects expired grants and deletes missing objects idempotently', async () => {
    const provider = new InMemoryObjectStorageProvider(() => new Date('2026-08-26T10:00:01.000Z'));
    const expiredAt = new Date('2026-08-26T10:00:00.000Z');
    const expiredGrant = await provider.createUploadGrant({
      key: 'fare-screenshots/u1/t1/a.png',
      mimeType: 'image/png',
      maxSizeBytes: 1024,
      expiresAt: expiredAt,
    });
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    await expect(provider.putForTest(expiredGrant, pngBytes)).rejects.toThrow('UPLOAD_GRANT_EXPIRED');
    await expect(provider.deleteObject('fare-screenshots/u1/t1/missing.png')).resolves.toBeUndefined();
  });

  it('enforces the grant MIME type and maximum object size', async () => {
    const provider = new InMemoryObjectStorageProvider();
    const grant = await provider.createUploadGrant({
      key: 'fare-screenshots/u1/t1/a.png', mimeType: 'image/png', maxSizeBytes: 4, expiresAt,
    });

    await expect(provider.putForTest(grant, Buffer.alloc(5), 'image/png')).rejects.toThrow('UPLOAD_TOO_LARGE');
    await expect(provider.putForTest(grant, Buffer.alloc(4), 'image/jpeg')).rejects.toThrow('UPLOAD_MIME_TYPE_NOT_ALLOWED');
    await provider.putForTest(grant, Buffer.alloc(4), 'image/png');
    await expect(provider.statObject(grant.objectKey)).resolves.toEqual({ key: grant.objectKey, mimeType: 'image/png', sizeBytes: 4 });
  });
});

describe('storage provider configuration', () => {
  const expiresAt = new Date('2099-08-26T10:00:00.000Z');
  const completeConfig = {
    QINIU_KODO_BUCKET: 'private-bucket',
    QINIU_KODO_UPLOAD_HOST: 'https://upload.example.test',
    QINIU_KODO_DOWNLOAD_HOST: 'https://download.example.test',
    QINIU_KODO_ACCESS_KEY: 'access-key',
    QINIU_KODO_SECRET_KEY: 'secret-key',
  };

  it('uses Kodo when fully configured, even outside production', () => {
    expect(createObjectStorageProvider({ ...completeConfig, NODE_ENV: 'test' })).toBeInstanceOf(KodoObjectStorageProvider);
  });

  it('falls back to in-memory when Kodo is not configured outside production', () => {
    expect(createObjectStorageProvider({ NODE_ENV: 'test' })).toBeInstanceOf(InMemoryObjectStorageProvider);
  });

  it('fails closed when production Kodo configuration is incomplete', async () => {
    const provider = createObjectStorageProvider({ NODE_ENV: 'production', QINIU_KODO_BUCKET: 'private-bucket' });

    await expect(provider.createUploadGrant({ key: 'fare-screenshots/u1/t1/a.png', mimeType: 'image/png', maxSizeBytes: 4, expiresAt })).rejects.toThrow('STORAGE_NOT_CONFIGURED');
    await expect(provider.statObject('fare-screenshots/u1/t1/a.png')).rejects.toThrow('STORAGE_NOT_CONFIGURED');
    await expect(provider.createPrivateDownloadUrl('fare-screenshots/u1/t1/a.png', 60)).rejects.toThrow('STORAGE_NOT_CONFIGURED');
    await expect(provider.deleteObject('fare-screenshots/u1/t1/a.png')).rejects.toThrow('STORAGE_NOT_CONFIGURED');
  });

  it('requires a download host and selects Kodo only with all production settings', async () => {
    const missingDownloadHost = createObjectStorageProvider({ ...completeConfig, NODE_ENV: 'production', QINIU_KODO_DOWNLOAD_HOST: ' ' });
    await expect(missingDownloadHost.createPrivateDownloadUrl('fare-screenshots/u1/t1/a.png', 60)).rejects.toThrow('STORAGE_NOT_CONFIGURED');
    expect(createObjectStorageProvider({ ...completeConfig, NODE_ENV: 'production' })).toBeInstanceOf(KodoObjectStorageProvider);
  });

  it('rejects an expired Kodo grant instead of issuing a token', async () => {
    const provider = new KodoObjectStorageProvider({
      bucket: 'private-bucket', uploadHost: 'https://upload.example.test', downloadHost: 'https://download.example.test',
      accessKey: 'access-key', secretKey: 'secret-key',
    });

    await expect(provider.createUploadGrant({
      key: 'fare-screenshots/u1/t1/a.png', mimeType: 'image/png', maxSizeBytes: 4,
      expiresAt: new Date(Date.now() - 1),
    })).rejects.toThrow('UPLOAD_GRANT_EXPIRED');
  });

  it('rejects a forged in-memory grant that changes the authorized key', async () => {
    const provider = new InMemoryObjectStorageProvider();
    const grant = await provider.createUploadGrant({
      key: 'fare-screenshots/u1/t1/a.png', mimeType: 'image/png', maxSizeBytes: 4, expiresAt,
    });

    await expect(provider.putForTest({ ...grant, objectKey: 'fare-screenshots/u1/t1/forged.png' }, Buffer.alloc(4), 'image/png'))
      .rejects.toThrow('UPLOAD_GRANT_INVALID');
  });

  it('rejects a second in-memory upload for an existing object key', async () => {
    const provider = new InMemoryObjectStorageProvider();
    const grant = await provider.createUploadGrant({
      key: 'fare-screenshots/u1/t1/a.png', mimeType: 'image/png', maxSizeBytes: 4, expiresAt,
    });

    await provider.putForTest(grant, Buffer.alloc(4), 'image/png');
    await expect(provider.putForTest(grant, Buffer.alloc(4), 'image/png')).rejects.toThrow('UPLOAD_OBJECT_ALREADY_EXISTS');
  });
});
