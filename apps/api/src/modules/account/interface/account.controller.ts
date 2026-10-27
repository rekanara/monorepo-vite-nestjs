import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  UploadedFile,
  UseInterceptors,
  Post,
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger"
import {
  ChangePasswordRequestSchema,
  NotificationPreferencesSchema,
  TwoFactorCodeRequestSchema,
  TwoFactorPasswordRequestSchema,
  UpdateProfileRequestSchema,
  type ChangePasswordRequest,
  type NotificationPreferences,
  type TwoFactorCodeRequest,
  type TwoFactorPasswordRequest,
  type UpdateProfileRequest,
} from "@workspace/contracts"
import { CurrentUser } from "../../../common/rbac/current-user.decorator"
import { ZodValidationPipe } from "../../../common/pipes/zod-validation.pipe"
import { Audited } from "../../../common/audit/audited.decorator"
import type { AuthenticatedUser } from "../../auth/interface/jwt.strategy"
import { AccountService } from "../application/account.service"

type UploadedMemoryFile = {
  buffer: Buffer
  mimetype: string
  size: number
}

// Self-service: any authenticated user, always operating on their own row, so no
// @RequirePermission / PermissionGuard (JwtAuthGuard alone is the right gate).
@ApiTags("Account")
@ApiBearerAuth("JWT-auth")
@Controller("account")
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @ApiOperation({ summary: "Get notification preferences" })
  @Get("notifications/preferences")
  notificationPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.account.getNotificationPreferences(user.id)
  }

  @ApiOperation({ summary: "Update notification preferences" })
  @Patch("notifications/preferences")
  @Audited("account.notifications.update", "user")
  updateNotificationPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(NotificationPreferencesSchema))
    body: NotificationPreferences
  ) {
    return this.account.updateNotificationPreferences(user.id, body)
  }

  @ApiOperation({ summary: "Update own profile" })
  @Patch("profile")
  @Audited("account.profile.update", "user")
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(UpdateProfileRequestSchema))
    body: UpdateProfileRequest
  ) {
    return this.account.updateProfile(user.id, body)
  }

  @ApiOperation({ summary: "Upload avatar image" })
  @Post("avatar")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 2_000_000 } }))
  @Audited("account.avatar.update", "user")
  uploadAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: UploadedMemoryFile
  ) {
    return this.account.uploadAvatar(user.id, file)
  }

  @ApiOperation({
    summary: "Change own password; signs out every session",
  })
  @Post("password")
  @HttpCode(204)
  @Audited("account.password.change", "user")
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(ChangePasswordRequestSchema))
    body: ChangePasswordRequest
  ) {
    await this.account.changePassword(user.id, body)
    return { id: user.id }
  }

  @ApiOperation({ summary: "Own two-factor status" })
  @Get("two-factor")
  twoFactorStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.account.twoFactorStatus(user.id)
  }

  @ApiOperation({ summary: "Start two-factor setup (returns QR data)" })
  @Post("two-factor/setup")
  @HttpCode(200)
  beginTwoFactorSetup(@CurrentUser() user: AuthenticatedUser) {
    return this.account.beginTwoFactorSetup(user.id)
  }

  @ApiOperation({ summary: "Confirm two-factor setup; returns backup codes" })
  @Post("two-factor/enable")
  @HttpCode(200)
  @Audited("account.two_factor.enable", "user")
  confirmTwoFactorSetup(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(TwoFactorCodeRequestSchema))
    body: TwoFactorCodeRequest
  ) {
    return this.account.confirmTwoFactorSetup(user.id, body.code)
  }

  @ApiOperation({
    summary: "Turn two-factor off (password; 403 if role requires it)",
  })
  @Post("two-factor/disable")
  @HttpCode(204)
  @Audited("account.two_factor.disable", "user")
  async disableTwoFactor(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(TwoFactorPasswordRequestSchema))
    body: TwoFactorPasswordRequest
  ) {
    await this.account.disableTwoFactor(
      user.id,
      body.currentPassword,
      user.sessionId
    )
    return { id: user.id }
  }

  @ApiOperation({
    summary: "Regenerate backup codes (password required); old codes die",
  })
  @Post("two-factor/backup-codes")
  @HttpCode(200)
  @Audited("account.two_factor.backup_codes", "user")
  regenerateBackupCodes(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(TwoFactorPasswordRequestSchema))
    body: TwoFactorPasswordRequest
  ) {
    return this.account.regenerateBackupCodes(user.id, body.currentPassword)
  }

  @ApiOperation({
    summary: "Reset two-factor (password required); re-enrols at next sign-in",
  })
  @Post("two-factor/reset")
  @HttpCode(204)
  @Audited("account.two_factor.reset", "user")
  async resetTwoFactor(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(TwoFactorPasswordRequestSchema))
    body: TwoFactorPasswordRequest
  ) {
    await this.account.resetTwoFactor(
      user.id,
      body.currentPassword,
      user.sessionId
    )
    return { id: user.id }
  }

  @ApiOperation({ summary: "Send email verification link" })
  @Post("verify-email")
  @HttpCode(204)
  async sendVerification(@CurrentUser() user: AuthenticatedUser) {
    await this.account.sendVerification(user.id)
  }

  @ApiOperation({ summary: "List own active sessions" })
  @Get("sessions")
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.account.listSessions(user.id, user.sessionId)
  }

  @ApiOperation({ summary: "Sign out every other session" })
  @Delete("sessions")
  @HttpCode(204)
  @Audited("account.sessions.revoke_others", "session")
  async revokeOtherSessions(@CurrentUser() user: AuthenticatedUser) {
    await this.account.revokeOtherSessions(user.id, user.sessionId)
    return { id: user.sessionId }
  }

  @ApiOperation({ summary: "Sign out one of own sessions" })
  @Delete("sessions/:id")
  @HttpCode(204)
  @Audited("account.session.revoke", "session")
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    await this.account.revokeSession(user.id, id)
    return { id }
  }
}
