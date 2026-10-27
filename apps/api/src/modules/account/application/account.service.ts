import { Inject, Injectable } from "@nestjs/common"
import type {
  BackupCodesResponse,
  ChangePasswordRequest,
  NotificationPreferences,
  SessionResponse,
  TwoFactorSetupResponse,
  TwoFactorStatusResponse,
  UpdateProfileRequest,
} from "@workspace/contracts"
import { PrismaService } from "../../../common/prisma/prisma.service"
import { detectImage } from "../../../common/storage/image"
import { StorageService } from "../../../common/storage/storage.service"
import {
  PASSWORD_HASHER,
  type PasswordHasherPort,
} from "../../auth/domain/ports/password-hasher.port"
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepositoryPort,
} from "../../auth/domain/ports/refresh-token-repository.port"
import {
  InvalidAvatarError,
  InvalidCredentialsError,
  SessionNotFoundError,
  StorageUnavailableError,
  TwoFactorNotEnabledError,
  TwoFactorRequiredError,
} from "../../auth/domain/errors/auth.errors"
import { TwoFactorService } from "../../auth/application/two-factor.service"
import { BackupCodeService } from "../../auth/application/backup-code.service"
import { UserNotFoundError } from "../../users/domain/users.errors"
import { InviteUseCase } from "../../auth/application/use-cases/invite.use-case"

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepositoryPort,
    private readonly invite: InviteUseCase,
    private readonly backupCodes: BackupCodeService,
    private readonly twoFactor: TwoFactorService
  ) {}

  async getNotificationPreferences(
    userId: string
  ): Promise<NotificationPreferences> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UserNotFoundError()
    return { pushEnabled: user.notificationPushEnabled }
  }

  async updateNotificationPreferences(
    userId: string,
    patch: NotificationPreferences
  ): Promise<NotificationPreferences> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { notificationPushEnabled: patch.pushEnabled },
    })
    return { pushEnabled: user.notificationPushEnabled }
  }

  async updateProfile(userId: string, patch: UpdateProfileRequest) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { fullName: patch.fullName },
    })
    return { id: user.id, fullName: user.fullName }
  }

  async uploadAvatar(
    userId: string,
    file?: { buffer: Buffer; mimetype: string; size: number }
  ) {
    if (!file) throw new InvalidAvatarError()
    if (!this.storage.enabled) throw new StorageUnavailableError()
    const image = detectImage(file.buffer)
    if (!image || file.size > 2_000_000) throw new InvalidAvatarError()
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UserNotFoundError()
    const result = await this.storage.replace(user.avatarKey, {
      feature: "avatars",
      scope: userId,
      body: file.buffer,
      contentType: image.mime,
      ext: image.ext,
    })
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarKey: result.key },
    })
    return { avatarUrl: result.url }
  }

  async changePassword(userId: string, input: ChangePasswordRequest) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UserNotFoundError()
    if (
      !user.passwordHash ||
      !(await this.hasher.verify(user.passwordHash, input.currentPassword))
    ) {
      throw new InvalidCredentialsError()
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.hasher.hash(input.newPassword) },
    })
    await this.refreshTokens.revokeAllForUser(userId)
  }

  async twoFactorStatus(userId: string): Promise<TwoFactorStatusResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { twoFactor: true, role: true },
    })
    if (!user) throw new UserNotFoundError()
    return {
      enabled: !!user.twoFactor?.enabledAt,
      required: user.role.requireTwoFactor,
      enabledAt: user.twoFactor?.enabledAt?.toISOString() ?? null,
      backupCodesRemaining: await this.backupCodes.remainingCount(userId),
    }
  }

  async regenerateBackupCodes(
    userId: string,
    currentPassword: string
  ): Promise<BackupCodesResponse> {
    await this.assertPassword(userId, currentPassword)
    const record = await this.prisma.userTwoFactor.findUnique({
      where: { userId },
    })
    if (!record?.enabledAt) throw new TwoFactorNotEnabledError()
    return { backupCodes: await this.backupCodes.regenerate(userId) }
  }

  async beginTwoFactorSetup(userId: string): Promise<TwoFactorSetupResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UserNotFoundError()
    return this.twoFactor.beginSetup(userId, user.email)
  }

  async confirmTwoFactorSetup(
    userId: string,
    code: string
  ): Promise<BackupCodesResponse> {
    return { backupCodes: await this.twoFactor.confirmSetup(userId, code) }
  }

  // Wipes the secret and codes. Role-required users re-enrol at next sign-in;
  // others are simply opted out. Both need the current password.
  async resetTwoFactor(
    userId: string,
    currentPassword: string,
    currentSessionId?: string
  ): Promise<void> {
    await this.assertPassword(userId, currentPassword)
    await this.prisma.userTwoFactor.deleteMany({ where: { userId } })
    await this.backupCodes.clear(userId)
    await this.revokeOtherSessions(userId, currentSessionId)
  }

  // Turning it off is only allowed when the role doesn't require it.
  async disableTwoFactor(
    userId: string,
    currentPassword: string,
    currentSessionId?: string
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    })
    if (!user) throw new UserNotFoundError()
    if (user.role.requireTwoFactor) throw new TwoFactorRequiredError()
    await this.resetTwoFactor(userId, currentPassword, currentSessionId)
  }

  private async assertPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UserNotFoundError()
    if (
      !user.passwordHash ||
      !(await this.hasher.verify(user.passwordHash, password))
    ) {
      throw new InvalidCredentialsError()
    }
  }

  async sendVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UserNotFoundError()
    if (!user.emailVerifiedAt)
      await this.invite.sendVerification(user.id, user.email)
  }

  async listSessions(
    userId: string,
    currentSessionId?: string
  ): Promise<SessionResponse[]> {
    const families = await this.prisma.refreshTokenFamily.findMany({
      where: { userId, revokedAt: null },
      include: {
        tokens: {
          where: { usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    })
    return families
      .filter((f) => f.tokens.length > 0)
      .map((f) => ({
        id: f.id,
        userAgent: f.userAgent,
        ipAddress: f.ipAddress,
        createdAt: f.createdAt.toISOString(),
        lastUsedAt: (f.tokens[0]?.createdAt ?? f.createdAt).toISOString(),
        current: f.id === currentSessionId,
      }))
  }

  async revokeOtherSessions(
    userId: string,
    currentSessionId?: string
  ): Promise<void> {
    await this.prisma.refreshTokenFamily.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(currentSessionId ? { id: { not: currentSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    })
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const family = await this.prisma.refreshTokenFamily.findUnique({
      where: { id: sessionId },
    })
    if (!family || family.userId !== userId || family.revokedAt)
      throw new SessionNotFoundError()
    await this.refreshTokens.revokeFamily(sessionId)
  }
}
