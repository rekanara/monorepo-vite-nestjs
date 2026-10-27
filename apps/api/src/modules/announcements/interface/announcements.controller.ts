import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger"
import {
  AnnouncementListQuerySchema,
  CreateAnnouncementSchema,
  UpdateAnnouncementSchema,
  type AnnouncementListQuery,
  type CreateAnnouncement,
  type UpdateAnnouncement,
} from "@workspace/contracts"
import { Audited } from "../../../common/audit/audited.decorator"
import { ZodValidationPipe } from "../../../common/pipes/zod-validation.pipe"
import { CurrentUser } from "../../../common/rbac/current-user.decorator"
import { PermissionGuard } from "../../../common/rbac/permission-guard"
import { RequirePermission } from "../../../common/rbac/require-permission.decorator"
import { MAX_IMAGE_BYTES } from "../../../common/storage/image"
import type { AuthenticatedUser } from "../../auth/interface/jwt.strategy"
import { AnnouncementsService } from "../application/announcements.service"

@ApiTags("Announcements")
@ApiBearerAuth("JWT-auth")
@Controller("announcements")
@UseGuards(PermissionGuard)
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @ApiOperation({ summary: "Published announcements, pinned first" })
  @Get()
  @RequirePermission("announcements.view")
  list(
    @Query(new ZodValidationPipe(AnnouncementListQuerySchema))
    q: AnnouncementListQuery
  ) {
    return this.announcements.list(q, false)
  }

  // Declared before ":id" so "manage" is not parsed as an id.
  @ApiOperation({ summary: "All announcements including drafts" })
  @Get("manage")
  @RequirePermission("announcements.manage")
  listAll(
    @Query(new ZodValidationPipe(AnnouncementListQuerySchema))
    q: AnnouncementListQuery
  ) {
    return this.announcements.list(q, true)
  }

  @ApiOperation({
    summary: "Upload a public image (JPEG/PNG/WebP, max 5 MB) for imageUrl",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["image"],
      properties: { image: { type: "string", format: "binary" } },
    },
  })
  @Post("image")
  @RequirePermission("announcements.manage")
  @UseInterceptors(
    FileInterceptor("image", {
      limits: { fileSize: MAX_IMAGE_BYTES + 512 * 1024, files: 1 },
    })
  )
  uploadImage(@UploadedFile() image?: { buffer: Buffer }) {
    return this.announcements.uploadImage(image)
  }

  @ApiOperation({ summary: "One announcement (drafts need manage)" })
  @Get("manage/:id")
  @RequirePermission("announcements.manage")
  getAny(@Param("id", ParseUUIDPipe) id: string) {
    return this.announcements.get(id, true)
  }

  @ApiOperation({ summary: "One published announcement" })
  @Get(":id")
  @RequirePermission("announcements.view")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.announcements.get(id, false)
  }

  @ApiOperation({
    summary: "Create; publishing pushes a notification to every active user",
  })
  @Post()
  @RequirePermission("announcements.manage")
  @Audited("announcement.create", "announcement")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateAnnouncementSchema))
    body: CreateAnnouncement
  ) {
    return this.announcements.create(user.id, body)
  }

  @ApiOperation({ summary: "Edit; draft to published pushes once" })
  @Patch(":id")
  @RequirePermission("announcements.manage")
  @Audited("announcement.update", "announcement")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateAnnouncementSchema))
    body: UpdateAnnouncement
  ) {
    return this.announcements.update(id, body)
  }

  @ApiOperation({ summary: "Delete an announcement" })
  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("announcements.manage")
  @Audited("announcement.delete", "announcement")
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    await this.announcements.remove(id)
  }
}
