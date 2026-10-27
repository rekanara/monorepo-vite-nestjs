import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from "@nestjs/common"
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger"
import {
  NotificationsQuerySchema,
  RegisterFcmDeviceSchema,
  type NotificationsQuery,
  type RegisterFcmDevice,
} from "@workspace/contracts"
import { CurrentUser } from "../../../common/rbac/current-user.decorator"
import { ZodValidationPipe } from "../../../common/pipes/zod-validation.pipe"
import type { AuthenticatedUser } from "../../auth/interface/jwt.strategy"
import { NotificationService } from "../application/notification.service"

@ApiTags("Notifications")
@ApiBearerAuth("JWT-auth")
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @ApiOperation({ summary: "Register or update my FCM device token" })
  @Post("devices")
  @HttpCode(204)
  registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(RegisterFcmDeviceSchema))
    body: RegisterFcmDevice
  ) {
    return this.notifications.registerDevice(user.id, body)
  }

  @ApiOperation({ summary: "Remove my FCM device token" })
  @Delete("devices/:deviceId")
  @HttpCode(204)
  unregisterDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param("deviceId") deviceId: string
  ) {
    return this.notifications.unregisterDevice(user.id, deviceId)
  }

  @ApiOperation({ summary: "List my notifications" })
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(NotificationsQuerySchema))
    query: NotificationsQuery
  ) {
    return this.notifications.list(
      user.id,
      query.page,
      query.limit,
      query.unreadOnly
    )
  }

  @ApiOperation({ summary: "Mark all my notifications as read" })
  @Post("read-all")
  @HttpCode(204)
  readAll(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.id)
  }

  @ApiOperation({ summary: "Mark one notification as read" })
  @Post(":id/read")
  read(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.notifications.markRead(user.id, id)
  }
}
