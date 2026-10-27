import type { PrismaTransactionClient } from "../../../../common/prisma/prisma.types"

export interface RefreshTokenFamilyRecord {
  id: string
  userId: string
  revokedAt: Date | null
}

export interface RefreshTokenRecord {
  id: string
  familyId: string
  tokenHash: string
  expiresAt: Date
  usedAt: Date | null
}

export interface RefreshTokenRepositoryPort {
  createFamily(
    userId: string,
    client?: { userAgent?: string; ipAddress?: string }
  ): Promise<RefreshTokenFamilyRecord>
  addToken(familyId: string, tokenHash: string): Promise<RefreshTokenRecord>
  findTokenByHash(
    tokenHash: string
  ): Promise<(RefreshTokenRecord & { family: RefreshTokenFamilyRecord }) | null>
  /**
   * Atomically marks the token as used, but only if it is still unused.
   * Returns true when this call won the race and performed the update, false when
   * another request had already marked the token used (a concurrent replay).
   */
  markTokenUsed(tokenId: string, replacedByTokenHash: string): Promise<boolean>
  revokeFamily(familyId: string): Promise<void>
  /**
   * Revokes every not-yet-revoked refresh token family belonging to this user
   * (e.g. on deactivation or a role change) - the equivalent of forcing every
   * active session to log out. Already-revoked families are left untouched.
   */
  revokeAllForUser(userId: string, tx?: PrismaTransactionClient): Promise<void>
}

export const REFRESH_TOKEN_REPOSITORY = Symbol("REFRESH_TOKEN_REPOSITORY")
