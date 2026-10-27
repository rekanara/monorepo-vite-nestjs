import { Inject, Injectable } from "@nestjs/common"
import { User } from "../../domain/entities/user.entity"
import { PrismaService } from "../../../../common/prisma/prisma.service"
import { TwoFactorService } from "../two-factor.service"
import { InvalidCredentialsError } from "../../domain/errors/auth.errors"
import {
  USER_REPOSITORY,
  UserRepositoryPort,
} from "../../domain/ports/user-repository.port"
import {
  PASSWORD_HASHER,
  PasswordHasherPort,
} from "../../domain/ports/password-hasher.port"
import {
  TOKEN_SERVICE,
  TokenServicePort,
} from "../../domain/ports/token-service.port"
import {
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenRepositoryPort,
} from "../../domain/ports/refresh-token-repository.port"

// A precomputed Argon2id hash of a fixed dummy value (generated with argon2.hash, same
// parameters as real hashes), used only to keep verify() timing consistent for
// unknown/inactive users — never a real credential.
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$7YKz1pWben/1QhI2b4OqEw$3uNsos3EmzAM4vYB90VcRMWZF26F21DJAm1qqM7hlrQ"

export interface LoginInput {
  email: string
  password: string
  userAgent?: string
  ipAddress?: string
}

export type LoginResult =
  | {
      requiresTwoFactor: true
      challengeToken: string
      setupRequired: boolean
      manualKey?: string
      otpauthUrl?: string
    }
  | {
      requiresTwoFactor: false
      accessToken: string
      expiresInSeconds: number
      refreshToken: string
      user: User
      backupCodes?: string[]
    }

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepositoryPort,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasherPort,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenServicePort,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepository: RefreshTokenRepositoryPort,
    private readonly prisma: PrismaService,
    private readonly twoFactor: TwoFactorService
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const user = await this.userRepository.findByEmail(
      input.email.trim().toLowerCase()
    )
    if (!user || !user.canAuthenticate()) {
      // Timing-safe enumeration defense: still pay the full Argon2id verify cost so an
      // unknown/inactive email takes as long as a real user with a wrong password.
      await this.passwordHasher.verify(DUMMY_PASSWORD_HASH, input.password)
      throw new InvalidCredentialsError()
    }

    // canAuthenticate() already proved hasPassword is true, so this is
    // never actually null here.
    const passwordMatches = await this.passwordHasher.verify(
      user.passwordHash!,
      input.password
    )
    if (!passwordMatches) {
      throw new InvalidCredentialsError()
    }

    const role = await this.prisma.role.findUnique({
      where: { id: user.roleId },
    })
    // Required by role, or voluntarily enabled from the account page.
    const optedIn = await this.prisma.userTwoFactor.findFirst({
      where: { userId: user.id, enabledAt: { not: null } },
      select: { userId: true },
    })
    if (role?.requireTwoFactor || optedIn) {
      return {
        requiresTwoFactor: true,
        ...(await this.twoFactor.challenge(user.id, user.email)),
      }
    }

    return this.issueSession(user, input)
  }

  async completeTwoFactor(input: {
    challengeToken: string
    code: string
    userAgent?: string
    ipAddress?: string
  }): Promise<Extract<LoginResult, { requiresTwoFactor: false }>> {
    const result = await this.twoFactor.verify(input.challengeToken, input.code)
    const user = await this.userRepository.findById(result.userId)
    if (!user || !user.canAuthenticate()) throw new InvalidCredentialsError()
    return {
      ...(await this.issueSession(user, input)),
      backupCodes: result.backupCodes,
    }
  }

  async completeTwoFactorBackup(input: {
    challengeToken: string
    backupCode: string
    userAgent?: string
    ipAddress?: string
  }): Promise<Extract<LoginResult, { requiresTwoFactor: false }>> {
    const userId = await this.twoFactor.verifyBackupCode(
      input.challengeToken,
      input.backupCode
    )
    const user = await this.userRepository.findById(userId)
    if (!user || !user.canAuthenticate()) throw new InvalidCredentialsError()
    return this.issueSession(user, input)
  }

  private async issueSession(
    user: User,
    input: { userAgent?: string; ipAddress?: string }
  ): Promise<Extract<LoginResult, { requiresTwoFactor: false }>> {
    const family = await this.refreshTokenRepository.createFamily(user.id, {
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    })
    const refreshToken = this.tokenService.generateOpaqueRefreshToken()
    await this.refreshTokenRepository.addToken(
      family.id,
      this.tokenService.hashRefreshToken(refreshToken)
    )

    const { token: accessToken, expiresInSeconds } =
      this.tokenService.signAccessToken({
        sub: user.id,
        roleId: user.roleId,
        sid: family.id,
      })

    await this.userRepository.updateLastLoginAt(user.id, new Date())

    return {
      requiresTwoFactor: false,
      accessToken,
      expiresInSeconds,
      refreshToken,
      user,
    }
  }
}
