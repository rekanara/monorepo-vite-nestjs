import { Injectable } from "@nestjs/common"
import { SECURITY_POLICY } from "@workspace/contracts"
import { PrismaService } from "../../../common/prisma/prisma.service"
import type { PrismaTransactionClient } from "../../../common/prisma/prisma.types"
import { generateId } from "../../../common/ids/id-generator"
import {
  RefreshTokenFamilyRecord,
  RefreshTokenRecord,
  RefreshTokenRepositoryPort,
} from "../domain/ports/refresh-token-repository.port"

// Global Constraint: refresh tokens live 7 days. Enforced server-side per token
// (tokens rotate, so each new token gets a fresh 7-day window).
const REFRESH_TOKEN_TTL_MS = SECURITY_POLICY.refreshTokenTtlMs

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async createFamily(
    userId: string,
    client: { userAgent?: string; ipAddress?: string } = {}
  ): Promise<RefreshTokenFamilyRecord> {
    const row = await this.prisma.refreshTokenFamily.create({
      data: {
        id: generateId(),
        userId,
        userAgent: client.userAgent?.slice(0, 512),
        ipAddress: client.ipAddress,
      },
    })
    return { id: row.id, userId: row.userId, revokedAt: row.revokedAt }
  }

  async addToken(
    familyId: string,
    tokenHash: string
  ): Promise<RefreshTokenRecord> {
    const row = await this.prisma.refreshToken.create({
      data: {
        id: generateId(),
        familyId,
        tokenHash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    })
    return {
      id: row.id,
      familyId: row.familyId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
    }
  }

  async findTokenByHash(
    tokenHash: string
  ): Promise<
    (RefreshTokenRecord & { family: RefreshTokenFamilyRecord }) | null
  > {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { family: true },
    })
    if (!row) return null
    return {
      id: row.id,
      familyId: row.familyId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
      family: {
        id: row.family.id,
        userId: row.family.userId,
        revokedAt: row.family.revokedAt,
      },
    }
  }

  async markTokenUsed(
    tokenId: string,
    replacedByTokenHash: string
  ): Promise<boolean> {
    // Conditional update (compare-and-set on usedAt IS NULL) so two concurrent
    // refreshes with the same token cannot both succeed: exactly one wins.
    const result = await this.prisma.refreshToken.updateMany({
      where: { id: tokenId, usedAt: null },
      data: { usedAt: new Date(), replacedByTokenHash },
    })
    return result.count > 0
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshTokenFamily.update({
      where: { id: familyId },
      data: { revokedAt: new Date() },
    })
  }

  async revokeAllForUser(
    userId: string,
    tx?: PrismaTransactionClient
  ): Promise<void> {
    await (tx ?? this.prisma).refreshTokenFamily.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }
}
