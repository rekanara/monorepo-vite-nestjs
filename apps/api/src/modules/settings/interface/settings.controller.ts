import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger"
import { AppSettingsSchema, type AppSettings } from "@workspace/contracts"
import { Audited } from "../../../common/audit/audited.decorator"
import { Public } from "../../../common/auth-public.decorator"
import { ZodValidationPipe } from "../../../common/pipes/zod-validation.pipe"
import { PermissionGuard } from "../../../common/rbac/permission-guard"
import { RequirePermission } from "../../../common/rbac/require-permission.decorator"
import { MAX_IMAGE_BYTES } from "../../../common/storage/image"
import { SettingsService } from "../application/settings.service"

@ApiTags("Settings")
@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // Outside PermissionGuard on purpose: branding is shown before sign-in.
  @ApiOperation({ summary: "Public branding (app name and logo)" })
  @Public()
  @Get("public")
  getPublic() {
    return this.settings.getPublic()
  }

  @ApiOperation({ summary: "Get app settings" })
  @ApiBearerAuth("JWT-auth")
  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission("settings.manage")
  get() {
    return this.settings.get()
  }

  @ApiOperation({ summary: "Update app settings" })
  @ApiBearerAuth("JWT-auth")
  @Put()
  @UseGuards(PermissionGuard)
  @RequirePermission("settings.manage")
  @Audited("settings.update", "settings")
  update(@Body(new ZodValidationPipe(AppSettingsSchema)) body: AppSettings) {
    return this.settings.update(body)
  }

  @ApiOperation({
    summary: "Upload a logo or banner image (JPEG/PNG/WebP, max 5 MB)",
  })
  @ApiBearerAuth("JWT-auth")
  @Post("image")
  @UseGuards(PermissionGuard)
  @RequirePermission("settings.manage")
  @UseInterceptors(
    FileInterceptor("image", {
      limits: { fileSize: MAX_IMAGE_BYTES + 512 * 1024, files: 1 },
    })
  )
  uploadImage(@UploadedFile() image?: { buffer: Buffer }) {
    return this.settings.uploadImage(image)
  }
}
