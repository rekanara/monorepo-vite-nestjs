import { Global, Module } from "@nestjs/common"
import { MAILER } from "./mailer.port"
import { NodemailerMailerService } from "./nodemailer-mailer.service"

@Global()
@Module({
  providers: [{ provide: MAILER, useClass: NodemailerMailerService }],
  exports: [MAILER],
})
export class MailerModule {}
