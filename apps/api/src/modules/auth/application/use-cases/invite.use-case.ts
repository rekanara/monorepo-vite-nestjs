import { Inject, Injectable } from "@nestjs/common"
import {
  formatDuration,
  SECURITY_POLICY,
  type AcceptInviteRequest,
} from "@workspace/contracts"
import { MAILER, type MailerPort } from "../../../../common/mailer/mailer.port"
import { PrismaService } from "../../../../common/prisma/prisma.service"
import {
  PASSWORD_HASHER,
  type PasswordHasherPort,
} from "../../domain/ports/password-hasher.port"
import { InvalidTokenError } from "../../domain/errors/auth.errors"
import { UserTokenService } from "../user-token.service"
import { webLink } from "../web-link"

const INVITE_TTL_MS = SECURITY_POLICY.inviteTtlMs
const VERIFY_TTL_MS = SECURITY_POLICY.emailVerificationTtlMs

@Injectable()
export class InviteUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: UserTokenService,
    @Inject(MAILER) private readonly mailer: MailerPort,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort
  ) {}

  /** Mails a set-password link to an invited (password-less) user. */
  async sendInvite(userId: string, email: string): Promise<void> {
    const token = await this.tokens.issueLink(userId, "invite", INVITE_TTL_MS)
    const url = webLink("WEB_ACCEPT_INVITE_URL", "/accept-invite", token)
    await this.mailer.send({
      to: email,
      subject: "You have been invited",
      text: `Set your password to activate your account: ${url}\n\nThis link expires in ${formatDuration(INVITE_TTL_MS)}.`,
      content: {
        preheader: "Set your password to activate your account.",
        heading: "You have been invited",
        paragraphs: [
          "An account has been created for you. Set your password to activate it and sign in.",
        ],
        button: { label: "Set your password", url },
        note: `This link expires in ${formatDuration(INVITE_TTL_MS)}. If you weren't expecting this invite, you can ignore this email.`,
      },
    })
  }

  async acceptInvite(input: AcceptInviteRequest): Promise<void> {
    const record = await this.tokens.findLink("invite", input.token)
    if (!record) throw new InvalidTokenError()

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          fullName: input.fullName,
          passwordHash: await this.hasher.hash(input.password),
          emailVerifiedAt: new Date(),
        },
      }),
      this.prisma.userToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ])
  }

  async sendVerification(userId: string, email: string): Promise<void> {
    const token = await this.tokens.issueLink(
      userId,
      "email_verify",
      VERIFY_TTL_MS
    )
    const url = webLink("WEB_VERIFY_EMAIL_URL", "/verify-email", token)
    await this.mailer.send({
      to: email,
      subject: "Verify your email",
      text: `Confirm your email address: ${url}\n\nThis link expires in ${formatDuration(VERIFY_TTL_MS)}.`,
      content: {
        preheader: "Confirm your email address.",
        heading: "Verify your email",
        paragraphs: [
          "Confirm that this is your email address to finish securing your account.",
        ],
        button: { label: "Verify email", url },
        note: `This link expires in ${formatDuration(VERIFY_TTL_MS)}. If you didn't request this, you can ignore this email.`,
      },
    })
  }

  async verifyEmail(token: string): Promise<void> {
    const record = await this.tokens.findLink("email_verify", token)
    if (!record) throw new InvalidTokenError()
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.userToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ])
  }
}
