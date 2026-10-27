import { Module } from "@nestjs/common"
import { SettingsService } from "./application/settings.service"
import { SettingsController } from "./interface/settings.controller"

@Module({ controllers: [SettingsController], providers: [SettingsService] })
export class SettingsModule {}
