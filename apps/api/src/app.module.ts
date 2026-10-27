import { randomUUID } from "node:crypto"
import { Module } from "@nestjs/common"
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core"
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler"
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis"
import Redis from "ioredis"
import { LoggerModule } from "nestjs-pino"
import { RedisModule } from "./common/redis/redis.module"
import { AppSettingsModule } from "./common/settings/app-settings.module"
import { REDIS } from "./common/redis/redis.tokens"
import { PrismaModule } from "./common/prisma/prisma.module"
import { AuditModule } from "./common/audit/audit.module"
import { StorageModule } from "./common/storage/storage.module"
import { MailerModule } from "./common/mailer/mailer.module"
import { PaymentModule } from "./common/payment/payment.module"
import { HealthModule } from "./modules/health/health.module"
import { MetricsModule } from "./modules/metrics/metrics.module"
import { AnnouncementsModule } from "./modules/announcements/announcements.module"
import { AttachmentsModule } from "./modules/attachments/attachments.module"
import { NotificationsModule } from "./modules/notifications/notifications.module"
import { SettingsModule } from "./modules/settings/settings.module"
import { SystemModule } from "./modules/system/system.module"
import { WebhooksModule } from "./modules/webhooks/webhooks.module"
import { ApiKeysModule } from "./modules/api-keys/api-keys.module"
import { MaintenanceModule } from "./modules/maintenance/maintenance.module"
import { AuthModule } from "./modules/auth/auth.module"
import { JwtAuthGuard } from "./modules/auth/interface/jwt-auth.guard"
import { RolesModule } from "./modules/roles/roles.module"
import { UsersModule } from "./modules/users/users.module"
import { AccountModule } from "./modules/account/account.module"
import { AllExceptionsFilter } from "./common/http/all-exceptions.filter"
import { ResponseEnvelopeInterceptor } from "./common/http/response-envelope.interceptor"

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        enabled: process.env.LOG_LEVEL !== "silent",
        level: process.env.LOG_LEVEL ?? "info",
        redact: ["req.headers.authorization", "req.headers.cookie"],
        genReqId: (req, res) => {
          const incoming = req.headers["x-request-id"]
          const id =
            typeof incoming === "string" && /^[\w-]{1,64}$/.test(incoming)
              ? incoming
              : randomUUID()
          res.setHeader("x-request-id", id)
          return id
        },
      },
    }),
    RedisModule,
    AppSettingsModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS],
      useFactory: async (redis: Redis) => {
        if (redis instanceof Redis && redis.status === "wait") {
          await redis.connect().catch(() => undefined)
        }
        return {
          throttlers: [
            { ttl: 60_000, limit: Number(process.env.THROTTLE_LIMIT ?? 100) },
          ],
          ...(redis instanceof Redis && redis.status === "ready"
            ? { storage: new ThrottlerStorageRedisService(redis) }
            : {}),
        }
      },
    }),
    PrismaModule,
    StorageModule,
    MailerModule,
    PaymentModule,
    RolesModule,
    UsersModule,
    AuthModule,
    AccountModule,
    AuditModule,
    HealthModule,
    MetricsModule,
    NotificationsModule,
    AttachmentsModule,
    AnnouncementsModule,
    SettingsModule,
    SystemModule,
    WebhooksModule,
    ApiKeysModule,
    MaintenanceModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
