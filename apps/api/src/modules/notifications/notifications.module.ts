import { Global, Module } from "@nestjs/common"
import { PushModule } from "../../common/push/push.module"
import { NotificationsController } from "./interface/notifications.controller"
import { NotificationService } from "./application/notification.service"

@Global()
@Module({
  imports: [PushModule],
  controllers: [NotificationsController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
