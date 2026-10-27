import { Module } from "@nestjs/common"
import { AnnouncementsService } from "./application/announcements.service"
import { AnnouncementsController } from "./interface/announcements.controller"

@Module({
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
