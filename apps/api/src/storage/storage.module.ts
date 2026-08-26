import { Module } from '@nestjs/common';
import { KodoObjectStorageProvider } from './kodo-object-storage.provider';
import { OBJECT_STORAGE_PROVIDER } from './object-storage.provider';

@Module({
  providers: [{
    provide: OBJECT_STORAGE_PROVIDER,
    useFactory: () => new KodoObjectStorageProvider({
      bucket: process.env.QINIU_KODO_BUCKET ?? '',
      uploadHost: process.env.QINIU_KODO_UPLOAD_HOST ?? '',
      accessKey: process.env.QINIU_KODO_ACCESS_KEY ?? '',
      secretKey: process.env.QINIU_KODO_SECRET_KEY ?? '',
    }),
  }],
  exports: [OBJECT_STORAGE_PROVIDER],
})
export class StorageModule {}
