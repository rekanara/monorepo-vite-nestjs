import type { EmailContent } from "./email-template"

export interface MailMessage {
  to: string
  subject: string
  /** Plain-text alternative; also what the test mailer inspects. */
  text: string
  /** Rendered into the branded HTML layout; plain text only when omitted. */
  content?: EmailContent
  replyTo?: string
}

export interface MailerPort {
  send(message: MailMessage): Promise<void>
}

export const MAILER = Symbol("MAILER")
