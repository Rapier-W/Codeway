import { Module } from '@nestjs/common';
import { KodoObjectStorageProvider } from './kodo-object-storage.provider';
import { OBJECT_STORAGE_PROVIDER } from './object-storage.provider';
import { InMemoryObjectStorageProvider } from './in-memory-object-storage.provider';
import { UnconfiguredObjectStorageProvider } from './unconfigured-object-storage.provider';

export function createObjectStorageProvider(env: NodeJS.ProcessEnv = process.env) {
  const complete = ['QINIU_KODO_BUCKET', 'QINIU_KODO_UPLOAD_HOST', 'QINIU_KODO_DOWNLOAD_HOST', 'QINIU_KODO_ACCESS_KEY', 'QINIU_KODO_SECRET_KEY']
    .every((key) => Boolean(env[key]?.trim()));
  if (env.NODE_ENV !== 'production') return new InMemoryObjectStorageProvider();
  if (!complete) return new UnconfiguredObjectStorageProvider();
  return new KodoObjectStorageProvider({
    bucket: env.QINIU_KODO_BUCKET!, uploadHost: env.QINIU_KODO_UPLOAD_HOST!, downloadHost: env.QINIU_KODO_DOWNLOAD_HOST!,
    accessKey: env.QINIU_KODO_ACCESS_KEY!, secretKey: env.QINIU_KODO_SECRET_KEY!,
  });
}

@Module({
  providers: [{
    provide: OBJECT_STORAGE_PROVIDER,
    useFactory: createObjectStorageProvider,
  }],
  exports: [OBJECT_STORAGE_PROVIDER],
})
export class StorageModule {}
