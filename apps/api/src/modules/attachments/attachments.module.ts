import { Module } from "@nestjs/common"
import { AttachmentsService } from "./application/attachments.service"
import { AttachmentsController } from "./interface/attachments.controller"

@Module({
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
})
export class AttachmentsModule {}
