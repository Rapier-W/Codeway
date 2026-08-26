import { InMemoryObjectStorageProvider } from './in-memory-object-storage.provider';

describe('InMemoryObjectStorageProvider', () => {
  const expiresAt = new Date('2026-08-26T10:00:00.000Z');

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
    const expiredGrant = await provider.createUploadGrant({
      key: 'fare-screenshots/u1/t1/a.png',
      mimeType: 'image/png',
      maxSizeBytes: 1024,
      expiresAt,
    });
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    await expect(provider.putForTest(expiredGrant, pngBytes)).rejects.toThrow('UPLOAD_GRANT_EXPIRED');
    await expect(provider.deleteObject('fare-screenshots/u1/t1/missing.png')).resolves.toBeUndefined();
  });
});
