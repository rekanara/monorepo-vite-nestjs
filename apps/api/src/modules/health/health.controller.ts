import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"
import type Redis from "ioredis"
import { Public } from "../../common/auth-public.decorator"
import { PrismaService } from "../../common/prisma/prisma.service"
import { REDIS } from "../../common/redis/redis.tokens"

const timeout = <T>(p: Promise<T>, ms = 2000) =>
  Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ])

@ApiTags("Health")
@Public()
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  @ApiOperation({ summary: "Liveness: process is up (no dependency checks)" })
  @Get(["", "live"])
  live() {
    return { status: "ok" }
  }

  @ApiOperation({
    summary: "Readiness: database and Redis reachable (503 if not)",
  })
  @Get("ready")
  async ready() {
    const check = async (fn: () => Promise<unknown>) => {
      try {
        await timeout(fn())
        return "up" as const
      } catch {
        return "down" as const
      }
    }
    const [database, redis] = await Promise.all([
      check(() => this.prisma.$queryRaw`SELECT 1`),
      check(async () => {
        if (this.redis.status === "wait") await this.redis.connect()
        return this.redis.ping()
      }),
    ])
    const result = { database, redis }
    if (database === "down" || redis === "down") {
      throw new ServiceUnavailableException({
        code: "NOT_READY",
        title: "Dependencies unavailable",
        detail: JSON.stringify(result),
      })
    }
    return { status: "ok", ...result }
  }
}
