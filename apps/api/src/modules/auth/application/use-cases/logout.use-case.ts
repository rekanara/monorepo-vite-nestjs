import { Inject, Injectable } from "@nestjs/common"
import {
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenRepositoryPort,
} from "../../domain/ports/refresh-token-repository.port"
import {
  TOKEN_SERVICE,
  TokenServicePort,
} from "../../domain/ports/token-service.port"

export interface LogoutInput {
  refreshToken: string
}

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepository: RefreshTokenRepositoryPort,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenServicePort
  ) {}

  async execute(input: LogoutInput): Promise<void> {
    const hash = this.tokenService.hashRefreshToken(input.refreshToken)
    const record = await this.refreshTokenRepository.findTokenByHash(hash)
    if (record) {
      await this.refreshTokenRepository.revokeFamily(record.familyId)
    }
    // Unknown token: logout is idempotent, no error for an already-gone session.
  }
}
