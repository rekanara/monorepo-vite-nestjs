import { Injectable } from "@nestjs/common"
import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto"
import type { UserToken } from "@prisma/client"
import { SECURITY_POLICY } from "@workspace/contracts"
import { generateId } from "../../../common/ids/id-generator"
import { PrismaService } from "../../../common/prisma/prisma.service"
import { loadEnv } from "../../../common/config/env.schema"

export type TokenPurpose =
  "password_reset" | "invite" | "email_verify" | "two_factor"

const MAX_ATTEMPTS = SECURITY_POLICY.maxCodeAttempts

@Injectable()
export class UserTokenService {
  private readonly pepper = loadEnv().REFRESH_TOKEN_PEPPER

  constructor(private readonly prisma: PrismaService) {}

  async issueLink(userId: string, purpose: TokenPurpose, ttlMs: number) {
    const token = randomBytes(32).toString("base64url")
    await this.issue(userId, purpose, "web", this.hash(token), ttlMs)
    return token
  }

  async issueOtp(userId: string, purpose: TokenPurpose, ttlMs: number) {
    const otp = String(randomInt(0, 1_000_000)).padStart(6, "0")
    await this.issue(
      userId,
      purpose,
      "mobile",
      this.otpHash(userId, otp),
      ttlMs
    )
    return otp
  }

  findLink(purpose: TokenPurpose, token: string) {
    return this.valid(purpose, { tokenHash: this.hash(token) })
  }

  async findOtp(purpose: TokenPurpose, userId: string, otp: string) {
    const record = await this.prisma.userToken.findFirst({
      where: {
        userId,
        purpose,
        channel: "mobile",
        usedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: MAX_ATTEMPTS },
      },
      orderBy: { createdAt: "desc" },
    })
    if (!record) return null
    if (
      timingSafeEqual(
        Buffer.from(record.tokenHash),
        Buffer.from(this.otpHash(userId, otp))
      )
    )
      return record
    await this.prisma.userToken.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    })
    return null
  }

  markUsed(id: string) {
    return this.prisma.userToken.update({
      where: { id },
      data: { usedAt: new Date() },
    })
  }

  private async issue(
    userId: string,
    purpose: TokenPurpose,
    channel: string,
    tokenHash: string,
    ttlMs: number
  ) {
    await this.prisma.$transaction([
      this.prisma.userToken.updateMany({
        where: { userId, purpose, channel, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.userToken.create({
        data: {
          id: generateId(),
          userId,
          purpose,
          channel,
          tokenHash,
          expiresAt: new Date(Date.now() + ttlMs),
        },
      }),
    ])
  }

  private async valid(
    purpose: TokenPurpose,
    where: { tokenHash: string }
  ): Promise<UserToken | null> {
    const record = await this.prisma.userToken.findUnique({ where })
    return record?.purpose === purpose &&
      !record.usedAt &&
      record.expiresAt > new Date()
      ? record
      : null
  }

  private otpHash(userId: string, otp: string) {
    return this.hash(`${userId}:${otp}`)
  }

  private hash(value: string) {
    return createHmac("sha256", this.pepper).update(value).digest("hex")
  }
}
