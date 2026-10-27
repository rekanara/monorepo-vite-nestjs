import { Inject, Injectable, Logger } from "@nestjs/common"
import type { Prisma } from "@prisma/client"
import type {
  NotificationResponse,
  NotificationType,
} from "@workspace/contracts"
import { DomainException } from "../../../common/errors/domain-exception"
import { generateId } from "../../../common/ids/id-generator"
import { PrismaService } from "../../../common/prisma/prisma.service"
import {
  PUSH_NOTIFIER,
  type PushNotifier,
} from "../../../common/push/push-notifier.port"
import { Paged } from "../../../common/http/response-envelope.interceptor"

class NotificationError extends DomainException {}

const USER_BATCH = 500
const TOKEN_PAGE = 1000

type NotificationRow = Prisma.NotificationGetPayload<object>

const toResponse = (r: NotificationRow): NotificationResponse => ({
  id: r.id,
  type: r.type as NotificationType,
  title: r.title,
  body: r.body,
  data: r.data as Record<string, string>,
  readAt: r.readAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
})

export interface NotifyInput {
  type: NotificationType
  title: string
  body: string
  data: Record<string, string>
  dedupeKey: string
  imageUrl?: string
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name)

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_NOTIFIER) private readonly pushNotifier: PushNotifier
  ) {}

  async registerDevice(
    userId: string,
    input: { deviceId: string; token: string; device: Record<string, unknown> }
  ) {
    await this.prisma.fcmDevice.deleteMany({
      where: { token: input.token, NOT: { userId, deviceId: input.deviceId } },
    })
    await this.prisma.fcmDevice.upsert({
      where: { userId_deviceId: { userId, deviceId: input.deviceId } },
      create: {
        id: generateId(),
        userId,
        deviceId: input.deviceId,
        token: input.token,
        device: input.device as Prisma.InputJsonValue,
      },
      update: {
        token: input.token,
        device: input.device as Prisma.InputJsonValue,
      },
    })
  }

  async unregisterDevice(userId: string, deviceId: string) {
    await this.prisma.fcmDevice.deleteMany({ where: { userId, deviceId } })
  }

  async notify(userIds: string[], input: NotifyInput): Promise<void> {
    const unique = [...new Set(userIds)]
    for (let i = 0; i < unique.length; i += USER_BATCH) {
      try {
        await this.deliver(unique.slice(i, i + USER_BATCH), input)
      } catch (err) {
        this.logger.error(`Notify ${input.dedupeKey} failed: ${String(err)}`)
      }
    }
  }

  async notifyAllActive(input: NotifyInput): Promise<void> {
    let cursor: string | undefined
    for (;;) {
      const users = await this.prisma.user.findMany({
        where: { isActive: true, ...(cursor ? { id: { gt: cursor } } : {}) },
        orderBy: { id: "asc" },
        take: USER_BATCH,
        select: { id: true },
      })
      if (users.length === 0) break
      cursor = users[users.length - 1]!.id
      await this.notify(
        users.map((u) => u.id),
        input
      )
      if (users.length < USER_BATCH) break
    }
  }

  async list(userId: string, page: number, limit: number, unreadOnly: boolean) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    }
    const [rows, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ])
    return Paged.of(rows.map(toResponse), total, page, limit, { unreadCount })
  }

  async markRead(userId: string, id: string): Promise<NotificationResponse> {
    const row = await this.prisma.notification.findUnique({ where: { id } })
    if (!row || row.userId !== userId) {
      throw new NotificationError({
        code: "NOTIFICATION_NOT_FOUND",
        title: "Notification not found",
        status: 404,
      })
    }
    if (row.readAt) return toResponse(row)
    return toResponse(
      await this.prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
      })
    )
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    })
  }

  private async deliver(userIds: string[], input: NotifyInput): Promise<void> {
    const inserted = await this.prisma.notification.createManyAndReturn({
      data: userIds.map((userId) => ({
        id: generateId(),
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data as Prisma.InputJsonValue,
        dedupeKey: input.dedupeKey,
      })),
      skipDuplicates: true,
      select: { userId: true },
    })
    if (inserted.length === 0) return
    await this.push(
      inserted.map((r) => r.userId),
      input
    )
  }

  private async push(userIds: string[], input: NotifyInput): Promise<void> {
    if (!this.pushNotifier.enabled || !(await this.pushAllowedGlobally()))
      return
    let cursor: string | undefined
    for (;;) {
      const devices = await this.prisma.fcmDevice.findMany({
        where: {
          userId: { in: userIds },
          user: { isActive: true, notificationPushEnabled: true },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: TOKEN_PAGE,
        select: { id: true, token: true },
      })
      if (devices.length === 0) break
      cursor = devices[devices.length - 1]!.id
      const result = await this.pushNotifier.send(
        devices.map((d) => d.token),
        {
          title: input.title,
          body: input.body,
          imageUrl: input.imageUrl,
          data: input.data,
        }
      )
      if (result.invalidTokens.length > 0) {
        await this.prisma.fcmDevice.deleteMany({
          where: { token: { in: result.invalidTokens } },
        })
      }
      if (devices.length < TOKEN_PAGE) break
    }
  }

  /** Admin kill switch in app settings; missing settings mean enabled. */
  private async pushAllowedGlobally(): Promise<boolean> {
    const row = await this.prisma.appSetting.findUnique({
      where: { id: "app" },
    })
    const value = row?.value as
      { pushNotificationsEnabled?: boolean } | undefined
    return value?.pushNotificationsEnabled !== false
  }
}
