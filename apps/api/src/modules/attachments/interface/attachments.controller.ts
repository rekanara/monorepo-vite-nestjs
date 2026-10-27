import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger"
import { CurrentUser } from "../../../common/rbac/current-user.decorator"
import type { AuthenticatedUser } from "../../auth/interface/jwt.strategy"
import { AttachmentsService } from "../application/attachments.service"

type UploadedMemoryFile = {
  buffer: Buffer
  mimetype: string
  size: number
  originalname: string
}

@ApiTags("Attachments")
@ApiBearerAuth("JWT-auth")
@Controller("attachments")
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @ApiOperation({ summary: "Upload one private attachment" })
  @Post()
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 10_000_000 } })
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: UploadedMemoryFile
  ) {
    return this.attachments.upload(user.id, file)
  }

  @ApiOperation({ summary: "Delete one of my attachments" })
  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.attachments.remove(user.id, id)
  }

  @ApiOperation({ summary: "List my recent attachments" })
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.attachments.list(user.id)
  }
}
