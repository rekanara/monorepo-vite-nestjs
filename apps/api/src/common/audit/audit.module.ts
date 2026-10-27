import { Global, Module } from "@nestjs/common"
import { APP_INTERCEPTOR } from "@nestjs/core"
import { AuditService } from "./audit.service"
import { AuditedInterceptor } from "./audited.interceptor"
import { AuditController } from "./audit.controller"

@Global()
@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditedInterceptor },
  ],
  exports: [AuditService],
})
export class AuditModule {}
