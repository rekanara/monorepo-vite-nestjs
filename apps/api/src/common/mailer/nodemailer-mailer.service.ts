import { Injectable } from "@nestjs/common"
import { createTransport, Transporter } from "nodemailer"
import { AppSettingsService } from "../settings/app-settings.service"
import { loadEnv } from "../config/env.schema"
import { renderEmail } from "./email-template"
import type { MailMessage, MailerPort } from "./mailer.port"

@Injectable()
export class NodemailerMailerService implements MailerPort {
  private readonly transporter: Transporter
  private readonly from: string

  constructor(private readonly settings: AppSettingsService) {
    const env = loadEnv()
    this.from = env.SMTP_FROM
    this.transporter = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      auth: env.SMTP_USERNAME
        ? { user: env.SMTP_USERNAME, pass: env.SMTP_PASSWORD }
        : undefined,
    })
  }

  async send(message: MailMessage): Promise<void> {
    const settings = await this.settings.get()
    const footer = settings.emailFooter
      ? `\n\n${settings.emailFooter}`
      : settings.supportEmail
        ? `\n\nNeed help? Contact ${settings.supportEmail}.`
        : ""
    const { content, ...rest } = message
    await this.transporter.sendMail({
      from: `${settings.appName} <${this.from}>`,
      replyTo: message.replyTo ?? settings.supportEmail ?? undefined,
      ...rest,
      text: `${message.text}${footer}`,
      html: renderEmail(
        content ?? {
          heading: message.subject,
          paragraphs: message.text.split("\n\n"),
        },
        settings
      ),
    })
  }
}
