import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"
import { Injectable } from "@nestjs/common"
import { authenticator } from "otplib"
import { DomainException } from "../../../common/errors/domain-exception"
import { loadEnv } from "../../../common/config/env.schema"
import { PrismaService } from "../../../common/prisma/prisma.service"
import { UserTokenService } from "./user-token.service"
import { BackupCodeService } from "./backup-code.service"

class TwoFactorError extends DomainException {}

const CHALLENGE_TTL_MS = 5 * 60 * 1000

@Injectable()
export class TwoFactorService {
  private readonly key = createHash("sha256")
    .update(loadEnv().REFRESH_TOKEN_PEPPER)
    .digest()

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: UserTokenService,
    private readonly backupCodes: BackupCodeService
  ) {}

  async challenge(userId: string, email: string) {
    const record = await this.prisma.userTwoFactor.findUnique({
      where: { userId },
    })
    const setupRequired = !record?.enabledAt
    const secret = record
      ? this.decrypt(record.secretEncrypted)
      : authenticator.generateSecret()
    if (!record) {
      await this.prisma.userTwoFactor.create({
        data: { userId, secretEncrypted: this.encrypt(secret) },
      })
    }
    return {
      challengeToken: await this.tokens.issueLink(
        userId,
        "two_factor",
        CHALLENGE_TTL_MS
      ),
      setupRequired,
      ...(setupRequired
        ? {
            manualKey: secret,
            otpauthUrl: authenticator.keyuri(email, "Rekanara", secret),
          }
        : {}),
    }
  }

  // Account-initiated enrolment: secret stays inactive until confirmSetup().
  async beginSetup(userId: string, email: string) {
    const existing = await this.prisma.userTwoFactor.findUnique({
      where: { userId },
    })
    if (existing?.enabledAt) throw this.alreadyEnabled()
    const secret = authenticator.generateSecret()
    await this.prisma.userTwoFactor.upsert({
      where: { userId },
      create: { userId, secretEncrypted: this.encrypt(secret) },
      update: { secretEncrypted: this.encrypt(secret) },
    })
    return {
      manualKey: secret,
      otpauthUrl: authenticator.keyuri(email, "Rekanara", secret),
    }
  }

  async confirmSetup(userId: string, code: string): Promise<string[]> {
    const record = await this.prisma.userTwoFactor.findUnique({
      where: { userId },
    })
    if (!record || record.enabledAt) throw this.invalid()
    if (!authenticator.check(code, this.decrypt(record.secretEncrypted))) {
      throw this.invalid()
    }
    await this.prisma.userTwoFactor.update({
      where: { userId },
      data: { enabledAt: new Date() },
    })
    return this.backupCodes.regenerate(userId)
  }

  async verify(
    challengeToken: string,
    code: string
  ): Promise<{ userId: string; backupCodes?: string[] }> {
    const token = await this.tokens.findLink("two_factor", challengeToken)
    if (!token) throw this.invalid()
    const record = await this.prisma.userTwoFactor.findUnique({
      where: { userId: token.userId },
    })
    if (!record) throw this.invalid()
    const firstTime = !record.enabledAt
    if (!authenticator.check(code, this.decrypt(record.secretEncrypted))) {
      throw this.invalid()
    }
    await this.prisma.$transaction([
      this.prisma.userTwoFactor.update({
        where: { userId: token.userId },
        data: { enabledAt: record.enabledAt ?? new Date() },
      }),
      this.prisma.userToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
    ])
    const backupCodes = firstTime
      ? await this.backupCodes.regenerate(token.userId)
      : undefined
    return { userId: token.userId, backupCodes }
  }

  async verifyBackupCode(
    challengeToken: string,
    code: string
  ): Promise<string> {
    const token = await this.tokens.findLink("two_factor", challengeToken)
    if (!token) throw this.invalid()
    const record = await this.prisma.userTwoFactor.findUnique({
      where: { userId: token.userId },
    })
    if (!record?.enabledAt) throw this.invalid()
    if (!(await this.backupCodes.consume(token.userId, code))) {
      throw this.invalid()
    }
    await this.prisma.userToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    })
    return token.userId
  }

  private encrypt(value: string) {
    const iv = randomBytes(12)
    const cipher = createCipheriv("aes-256-gcm", this.key, iv)
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ])
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
      "base64url"
    )
  }

  private decrypt(value: string) {
    const raw = Buffer.from(value, "base64url")
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const ciphertext = raw.subarray(28)
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8")
  }

  private alreadyEnabled() {
    return new TwoFactorError({
      code: "TWO_FACTOR_ALREADY_ENABLED",
      title: "Two-factor authentication is already enabled",
      status: 409,
    })
  }

  private invalid() {
    return new TwoFactorError({
      code: "INVALID_TWO_FACTOR_CODE",
      title: "Invalid two-factor code",
      status: 401,
    })
  }
}
