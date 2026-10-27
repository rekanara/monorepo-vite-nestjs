import { Injectable, Logger } from "@nestjs/common"
import { Cron } from "@nestjs/schedule"
import { AppSettingsService } from "../../../common/settings/app-settings.service"
import { PrismaService } from "../../../common/prisma/prisma.service"

const LOCK_ID = 742101
const DAY_MS = 24 * 60 * 60 * 1000

export interface MaintenanceResult {
  ran: boolean
  cutoff: string | null
  deleted: Record<string, number>
}

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService
  ) {}

  @Cron("17 3 * * *")
  async scheduled() {
    await this.run().catch((err) =>
      this.logger.error(`Maintenance cleanup failed: ${String(err)}`)
    )
  }

  async run(): Promise<MaintenanceResult> {
    const [lock] = await this.prisma.$queryRaw<
      { pg_try_advisory_lock: boolean }[]
    >`SELECT pg_try_advisory_lock(${LOCK_ID})`
    const locked = lock?.pg_try_advisory_lock === true
    if (!locked) return { ran: false, cutoff: null, deleted: {} }
    try {
      const retentionDays = (await this.settings.get()).maintenanceRetentionDays
      const cutoff = new Date(Date.now() - retentionDays * DAY_MS)
      const [userTokens, refreshTokens, webhookEvents, notifications] =
        await this.prisma.$transaction([
          this.prisma.userToken.deleteMany({
            where: {
              OR: [{ usedAt: { not: null } }, { expiresAt: { lt: cutoff } }],
            },
          }),
          this.prisma.refreshToken.deleteMany({
            where: {
              OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { not: null } }],
            },
          }),
          this.prisma.webhookEvent.deleteMany({
            where: {
              receivedAt: { lt: cutoff },
              status: { in: ["processed"] },
            },
          }),
          this.prisma.notification.deleteMany({
            where: { createdAt: { lt: cutoff }, readAt: { not: null } },
          }),
        ])
      return {
        ran: true,
        cutoff: cutoff.toISOString(),
        deleted: {
          userTokens: userTokens.count,
          refreshTokens: refreshTokens.count,
          webhookEvents: webhookEvents.count,
          notifications: notifications.count,
        },
      }
    } finally {
      await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_ID})`
    }
  }
}
