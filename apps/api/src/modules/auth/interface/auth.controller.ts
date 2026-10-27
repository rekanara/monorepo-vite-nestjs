import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UsePipes,
} from "@nestjs/common"
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger"
import { Throttle } from "@nestjs/throttler"
import type { Request, Response } from "express"
import {
  AcceptInviteRequestSchema,
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  ResetPasswordRequestSchema,
  TwoFactorBackupRequestSchema,
  TwoFactorVerifyRequestSchema,
  VerifyEmailRequestSchema,
  type AcceptInviteRequest,
  type ForgotPasswordRequest,
  type ResetPasswordRequest,
  type VerifyEmailRequest,
} from "@workspace/contracts"
import { ZodValidationPipe } from "../../../common/pipes/zod-validation.pipe"
import { Public } from "../../../common/auth-public.decorator"
import { CurrentUser } from "../../../common/rbac/current-user.decorator"
import type { AuthenticatedUser } from "./jwt.strategy"
import { LoginUseCase } from "../application/use-cases/login.use-case"
import { RefreshTokenUseCase } from "../application/use-cases/refresh-token.use-case"
import { LogoutUseCase } from "../application/use-cases/logout.use-case"
import { GetMeUseCase } from "../application/use-cases/get-me.use-case"
import { PasswordResetUseCase } from "../application/use-cases/password-reset.use-case"
import { InviteUseCase } from "../application/use-cases/invite.use-case"
import {
  InvalidRefreshTokenError,
  TokenReuseDetectedError,
} from "../domain/errors/auth.errors"
import {
  clearRefreshTokenCookie,
  deliverRefreshToken,
  readRefreshToken,
} from "./cookies"

// Own limit (read lazily) so loosening the global THROTTLE_LIMIT never loosens login.
const loginThrottleLimit = () => Number(process.env.LOGIN_THROTTLE_LIMIT ?? 10)

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly getMeUseCase: GetMeUseCase,
    private readonly passwordResetUseCase: PasswordResetUseCase,
    private readonly inviteUseCase: InviteUseCase
  ) {}

  @Public()
  @ApiOperation({ summary: "Login with email and password" })
  @Post("login")
  @Throttle({ default: { ttl: 60_000, limit: loginThrottleLimit } })
  @UsePipes(new ZodValidationPipe(LoginRequestSchema))
  async login(
    @Body() body: { email: string; password: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.loginUseCase.execute({
      ...body,
      userAgent: req.get("user-agent"),
      ipAddress: req.ip,
    })
    return this.loginResponse(req, res, result)
  }

  @Public()
  @ApiOperation({ summary: "Complete two-factor login" })
  @Post("2fa/verify")
  @Throttle({ default: { ttl: 60_000, limit: loginThrottleLimit } })
  @UsePipes(new ZodValidationPipe(TwoFactorVerifyRequestSchema))
  async verifyTwoFactor(
    @Body() body: { challengeToken: string; code: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.loginUseCase.completeTwoFactor({
      ...body,
      userAgent: req.get("user-agent"),
      ipAddress: req.ip,
    })
    return this.loginResponse(req, res, result)
  }

  @Public()
  @ApiOperation({ summary: "Complete two-factor login with backup code" })
  @Post("2fa/verify-backup")
  @Throttle({ default: { ttl: 60_000, limit: loginThrottleLimit } })
  @UsePipes(new ZodValidationPipe(TwoFactorBackupRequestSchema))
  async verifyTwoFactorBackup(
    @Body() body: { challengeToken: string; backupCode: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.loginUseCase.completeTwoFactorBackup({
      ...body,
      userAgent: req.get("user-agent"),
      ipAddress: req.ip,
    })
    return this.loginResponse(req, res, result)
  }

  private loginResponse(
    req: Request,
    res: Response,
    result: Awaited<ReturnType<LoginUseCase["execute"]>>
  ) {
    if (result.requiresTwoFactor) return result
    return {
      requiresTwoFactor: false,
      ...deliverRefreshToken(req, res, result.refreshToken),
      accessToken: result.accessToken,
      accessTokenExpiresInSeconds: result.expiresInSeconds,
      user: {
        id: result.user.id,
        email: result.user.email,
        roleId: result.user.roleId,
      },
      backupCodes: result.backupCodes,
    }
  }

  @Public()
  @ApiOperation({ summary: "Send password reset link or OTP" })
  @Post("forgot-password")
  @HttpCode(204)
  @UsePipes(new ZodValidationPipe(ForgotPasswordRequestSchema))
  async forgotPassword(@Body() body: ForgotPasswordRequest) {
    await this.passwordResetUseCase.request(body)
  }

  @Public()
  @ApiOperation({ summary: "Reset password using link token or mobile OTP" })
  @Post("reset-password")
  @HttpCode(204)
  @UsePipes(new ZodValidationPipe(ResetPasswordRequestSchema))
  async resetPassword(@Body() body: ResetPasswordRequest) {
    await this.passwordResetUseCase.reset(body)
  }

  @Public()
  @ApiOperation({ summary: "Accept invite: set name and password" })
  @Post("accept-invite")
  @HttpCode(204)
  @Throttle({ default: { ttl: 60_000, limit: loginThrottleLimit } })
  @UsePipes(new ZodValidationPipe(AcceptInviteRequestSchema))
  async acceptInvite(@Body() body: AcceptInviteRequest) {
    await this.inviteUseCase.acceptInvite(body)
  }

  @Public()
  @ApiOperation({ summary: "Confirm email address from link token" })
  @Post("verify-email")
  @HttpCode(204)
  @Throttle({ default: { ttl: 60_000, limit: loginThrottleLimit } })
  @UsePipes(new ZodValidationPipe(VerifyEmailRequestSchema))
  async verifyEmail(@Body() body: VerifyEmailRequest) {
    await this.inviteUseCase.verifyEmail(body.token)
  }

  @ApiOperation({ summary: "Get current user info and active permissions" })
  @ApiBearerAuth("JWT-auth")
  @Get("me")
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.getMeUseCase.execute({ userId: user.id })
  }

  @Public()
  @ApiOperation({ summary: "Refresh access token" })
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const token = readRefreshToken(req)
    if (!token) {
      clearRefreshTokenCookie(res)
      throw new UnauthorizedException({
        code: "MISSING_REFRESH_TOKEN",
        title: "No refresh token cookie present",
      })
    }

    try {
      const result = await this.refreshTokenUseCase.execute({
        refreshToken: token,
      })
      return {
        ...deliverRefreshToken(req, res, result.refreshToken),
        accessToken: result.accessToken,
        accessTokenExpiresInSeconds: result.expiresInSeconds,
      }
    } catch (err) {
      if (
        err instanceof InvalidRefreshTokenError ||
        err instanceof TokenReuseDetectedError
      ) {
        clearRefreshTokenCookie(res)
      }
      throw err
    }
  }

  @Public()
  @ApiOperation({ summary: "Logout current session" })
  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = readRefreshToken(req)
    if (token) await this.logoutUseCase.execute({ refreshToken: token })
    clearRefreshTokenCookie(res)
  }
}
