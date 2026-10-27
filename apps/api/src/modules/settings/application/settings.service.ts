import { Injectable, Logger } from "@nestjs/common"
import {
  AppSettingsSchema,
  type AppSettings,
  type PublicAppSettings,
} from "@workspace/contracts"
import { DomainException } from "../../../common/errors/domain-exception"
import { detectImage, MAX_IMAGE_BYTES } from "../../../common/storage/image"
import { StorageService } from "../../../common/storage/storage.service"
import { AppSettingsService } from "../../../common/settings/app-settings.service"

class SettingsError extends DomainException {}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name)

  constructor(
    private readonly appSettings: AppSettingsService,
    private readonly storage: StorageService
  ) {}

  async get(): Promise<AppSettings> {
    return this.appSettings.get()
  }

  async getPublic(): Promise<PublicAppSettings> {
    const { appName, tagline, logoUrl, bannerUrl, supportEmail, loginNotice } =
      await this.get()
    return { appName, tagline, logoUrl, bannerUrl, supportEmail, loginNotice }
  }

  async update(input: AppSettings): Promise<AppSettings> {
    const previous = await this.get()
    const value = AppSettingsSchema.parse(input)
    await this.appSettings.update(value)
    if (previous.logoUrl !== value.logoUrl)
      await this.removeOwnImage(previous.logoUrl)
    if (previous.bannerUrl !== value.bannerUrl)
      await this.removeOwnImage(previous.bannerUrl)
    return value
  }

  /** Stores a public logo/banner and returns its URL; saving settings applies it. */
  async uploadImage(file?: { buffer: Buffer }) {
    if (!file?.buffer.length)
      throw this.error("IMAGE_REQUIRED", "An image file is required", 400)
    if (file.buffer.length > MAX_IMAGE_BYTES)
      throw this.error("IMAGE_TOO_LARGE", "Image must be 5 MB or smaller", 400)
    const image = detectImage(file.buffer)
    if (!image)
      throw this.error("INVALID_IMAGE", "Only JPEG, PNG or WebP images", 400)
    if (!this.storage.enabled)
      throw this.error(
        "STORAGE_UNAVAILABLE",
        "Object storage is not configured",
        503
      )
    const { url } = await this.storage.upload({
      feature: "branding",
      body: file.buffer,
      contentType: image.mime,
      ext: image.ext,
    })
    return { url: url! }
  }

  private async removeOwnImage(url: string | null) {
    const key = this.storage.keyFromUrl(url)
    if (!key?.startsWith("branding/public/")) return
    try {
      await this.storage.remove(key)
    } catch (err) {
      this.logger.warn(
        `Could not delete old branding image ${key}: ${String(err)}`
      )
    }
  }

  private error(code: string, title: string, status: number) {
    return new SettingsError({ code, title, status })
  }
}
