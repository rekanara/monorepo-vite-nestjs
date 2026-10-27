import { Global, Module } from "@nestjs/common"
import { PUSH_NOTIFIER } from "./push-notifier.port"
import { FirebasePushService } from "./firebase-push.service"

@Global()
@Module({
  providers: [{ provide: PUSH_NOTIFIER, useClass: FirebasePushService }],
  exports: [PUSH_NOTIFIER],
})
export class PushModule {}
