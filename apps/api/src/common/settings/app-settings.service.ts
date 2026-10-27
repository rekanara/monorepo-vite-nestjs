import { Injectable } from "@nestjs/common"
import { AppSettingsSchema, type AppSettings } from "@workspace/contracts"
import { PrismaService } from "../prisma/prisma.service"

export const APP_SETTINGS_ID = "app"

@Injectable()
export class AppSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<AppSettings> {
    const row = await this.prisma.appSetting.findUnique({
      where: { id: APP_SETTINGS_ID },
    })
    return AppSettingsSchema.parse(row?.value ?? {})
  }

  async update(input: AppSettings): Promise<AppSettings> {
    const value = AppSettingsSchema.parse(input)
    await this.prisma.appSetting.upsert({
      where: { id: APP_SETTINGS_ID },
      create: { id: APP_SETTINGS_ID, value },
      update: { value },
    })
    return value
  }
}
