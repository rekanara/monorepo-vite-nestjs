import { Controller, Get, Inject, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger"
import type Redis from "ioredis"
import type { SystemStatus } from "@workspace/contracts"
import { loadEnv } from "../../common/config/env.schema"
import {
  PAYMENT_GATEWAY,
  type PaymentGatewayPort,
} from "../../common/payment/payment-gateway.port"
import { PrismaService } from "../../common/prisma/prisma.service"
import {
  PUSH_NOTIFIER,
  type PushNotifier,
} from "../../common/push/push-notifier.port"
import { PermissionGuard } from "../../common/rbac/permission-guard"
import { RequirePermission } from "../../common/rbac/require-permission.decorator"
import { REDIS } from "../../common/redis/redis.tokens"
import { StorageService } from "../../common/storage/storage.service"

const probe = async (fn: () => Promise<unknown>) => {
  const started = Date.now()
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(), 2000)),
    ])
    return { status: "up" as const, latencyMs: Date.now() - started }
  } catch {
    return { status: "down" as const, latencyMs: null }
  }
}

@ApiTags("System")
@ApiBearerAuth("JWT-auth")
@Controller("system")
@UseGuards(PermissionGuard)
export class SystemController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(PUSH_NOTIFIER) private readonly push: PushNotifier,
    @Inject(PAYMENT_GATEWAY) private readonly payment: PaymentGatewayPort
  ) {}

  @ApiOperation({ summary: "Dependency and integration status" })
  @Get("status")
  @RequirePermission("settings.manage")
  async status(): Promise<SystemStatus> {
    const env = loadEnv()
    const [database, redis] = await Promise.all([
      probe(() => this.prisma.$queryRaw`SELECT 1`),
      probe(async () => {
        if (this.redis.status === "wait") await this.redis.connect()
        return this.redis.ping()
      }),
    ])
    return {
      version: process.env.npm_package_version ?? null,
      environment: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database, redis },
      integrations: {
        storage: this.storage.enabled,
        push: this.push.enabled,
        payment: this.payment.enabled,
        mailer: Boolean(env.SMTP_HOST),
      },
    }
  }
}
