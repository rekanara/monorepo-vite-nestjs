import { Global, Module } from "@nestjs/common"
import { OBJECT_STORAGE } from "./object-storage.port"
import { S3ObjectStorage } from "./s3-object-storage.service"
import { StorageService } from "./storage.service"

@Global()
@Module({
  providers: [
    { provide: OBJECT_STORAGE, useClass: S3ObjectStorage },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
