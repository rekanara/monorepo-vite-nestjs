import { Inject, Injectable } from "@nestjs/common"
import {
  formatDuration,
  SECURITY_POLICY,
  type ForgotPasswordRequest,
  type ResetPasswordRequest,
} from "@workspace/contracts"
import { MAILER, type MailerPort } from "../../../../common/mailer/mailer.port"
import { PrismaService } from "../../../../common/prisma/prisma.service"
import {
  PASSWORD_HASHER,
  type PasswordHasherPort,
} from "../../domain/ports/password-hasher.port"
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepositoryPort,
} from "../../domain/ports/refresh-token-repository.port"
import { UserTokenService } from "../user-token.service"
import { webLink } from "../web-link"

const WEB_TTL_MS = SECURITY_POLICY.passwordResetLinkTtlMs
const MOBILE_TTL_MS = SECURITY_POLICY.passwordResetCodeTtlMs

@Injectable()
export class PasswordResetUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: UserTokenService,
    @Inject(MAILER) private readonly mailer: MailerPort,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepositoryPort
  ) {}

  async request(input: ForgotPasswordRequest): Promise<void> {
    const email = input.email.trim().toLowerCase()
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user || !user.isActive || !user.passwordHash) return

    if (input.channel === "mobile") {
      const otp = await this.tokens.issueOtp(
        user.id,
        "password_reset",
        MOBILE_TTL_MS
      )
      await this.mailer.send({
        to: email,
        subject: "Your password reset code",
        text: `Your password reset code is ${otp}. It expires in ${formatDuration(MOBILE_TTL_MS)}.`,
        content: {
          preheader: `Your code is ${otp}.`,
          heading: "Your password reset code",
          paragraphs: ["Enter this code in the app to reset your password."],
          code: otp,
          note: `This code expires in ${formatDuration(MOBILE_TTL_MS)}. If you didn't request it, you can ignore this email; your password stays the same.`,
        },
      })
      return
    }

    const token = await this.tokens.issueLink(
      user.id,
      "password_reset",
      WEB_TTL_MS
    )
    const url = webLink("WEB_RESET_PASSWORD_URL", "/reset-password", token)
    await this.mailer.send({
      to: email,
      subject: "Reset your password",
      text: `Open this link to reset your password: ${url}\n\nThis link expires in ${formatDuration(WEB_TTL_MS)}.`,
      content: {
        preheader: "Reset your password.",
        heading: "Reset your password",
        paragraphs: [
          "We received a request to reset your password. Use the button below to choose a new one.",
        ],
        button: { label: "Reset password", url },
        note: `This link expires in ${formatDuration(WEB_TTL_MS)}. If you didn't request it, you can ignore this email; your password stays the same.`,
      },
    })
  }

  async reset(input: ResetPasswordRequest): Promise<void> {
    const record =
      input.channel === "web"
        ? await this.tokens.findLink("password_reset", input.token)
        : await this.findMobileToken(
            input.email.trim().toLowerCase(),
            input.otp
          )
    if (!record) return

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await this.hasher.hash(input.newPassword) },
      }),
      this.prisma.userToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ])
    await this.refreshTokens.revokeAllForUser(record.userId)
  }

  private async findMobileToken(email: string, otp: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    return user && this.tokens.findOtp("password_reset", user.id, otp)
  }
}
