import { Inject, Injectable } from "@nestjs/common"
import {
  InvalidRefreshTokenError,
  TokenReuseDetectedError,
} from "../../domain/errors/auth.errors"
import {
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenRepositoryPort,
} from "../../domain/ports/refresh-token-repository.port"
import {
  TOKEN_SERVICE,
  TokenServicePort,
} from "../../domain/ports/token-service.port"
import {
  USER_ROLE_LOOKUP,
  UserRoleLookupPort,
} from "../../domain/ports/user-repository.port"

export interface RefreshTokenInput {
  refreshToken: string
}

export interface RefreshTokenResult {
  accessToken: string
  expiresInSeconds: number
  refreshToken: string
}

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepository: RefreshTokenRepositoryPort,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenServicePort,
    @Inject(USER_ROLE_LOOKUP)
    private readonly userRoleLookup: UserRoleLookupPort
  ) {}

  async execute(input: RefreshTokenInput): Promise<RefreshTokenResult> {
    const incomingHash = this.tokenService.hashRefreshToken(input.refreshToken)
    const record =
      await this.refreshTokenRepository.findTokenByHash(incomingHash)

    if (!record) {
      throw new InvalidRefreshTokenError()
    }
    // Reuse detection must win over expiry: a token that was already used (then replayed
    // after sitting idle past its 7-day expiry) is still a reuse signal and must revoke the
    // family, not just get a quiet "expired" 401 that lets the attacker's rotated chain live on.
    if (record.usedAt) {
      await this.refreshTokenRepository.revokeFamily(record.familyId)
      throw new TokenReuseDetectedError()
    }
    // Server-side 7-day expiry for a token that was genuinely never used. Mere expiry is
    // normal lifecycle, not an attack signal, so the family is NOT revoked here.
    if (record.expiresAt < new Date()) {
      throw new InvalidRefreshTokenError()
    }
    if (record.family.revokedAt) {
      throw new InvalidRefreshTokenError()
    }

    const user = await this.userRoleLookup.getUserForRefresh(
      record.family.userId
    )
    // A deactivated user must lose every session: kill the whole family.
    if (!user.isActive) {
      await this.refreshTokenRepository.revokeFamily(record.familyId)
      throw new InvalidRefreshTokenError()
    }

    const newRefreshToken = this.tokenService.generateOpaqueRefreshToken()
    const newHash = this.tokenService.hashRefreshToken(newRefreshToken)
    // Compare-and-set: if a concurrent request already rotated this token between our
    // read above and this write, we lost the race — treat it exactly like a replay.
    const won = await this.refreshTokenRepository.markTokenUsed(
      record.id,
      newHash
    )
    if (!won) {
      await this.refreshTokenRepository.revokeFamily(record.familyId)
      throw new TokenReuseDetectedError()
    }
    await this.refreshTokenRepository.addToken(record.familyId, newHash)

    const { token: accessToken, expiresInSeconds } =
      this.tokenService.signAccessToken({
        sub: record.family.userId,
        roleId: user.roleId,
        sid: record.familyId,
      })

    return { accessToken, expiresInSeconds, refreshToken: newRefreshToken }
  }
}
