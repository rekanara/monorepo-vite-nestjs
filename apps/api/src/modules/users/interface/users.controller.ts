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
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import type { Response } from "express"
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger"
import {
  BulkUserActionSchema,
  CreateUserRequestSchema,
  ResetUserPasswordRequestSchema,
  UpdateUserRequestSchema,
  UserExportQuerySchema,
  UserListQuerySchema,
  type BulkUserAction,
  type CreateUserRequest,
  type ResetUserPasswordRequest,
  type UpdateUserRequest,
  type UserExportQuery,
  type UserListQuery,
} from "@workspace/contracts"
import { PermissionGuard } from "../../../common/rbac/permission-guard"
import { RequirePermission } from "../../../common/rbac/require-permission.decorator"
import { CurrentUser } from "../../../common/rbac/current-user.decorator"
import { ZodValidationPipe } from "../../../common/pipes/zod-validation.pipe"
import { Audited } from "../../../common/audit/audited.decorator"
import type { AuthenticatedUser } from "../../auth/interface/jwt.strategy"
import { UsersService } from "../application/users.service"

@ApiTags("Users")
@ApiBearerAuth("JWT-auth")
@Controller("users")
@UseGuards(PermissionGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @ApiOperation({ summary: "List users" })
  @Get()
  @RequirePermission("users.manage")
  list(@Query(new ZodValidationPipe(UserListQuerySchema)) q: UserListQuery) {
    return this.users.list(q)
  }

  @ApiOperation({ summary: "Export active users as CSV or XLSX" })
  @Get("export")
  @RequirePermission("users.manage")
  @Audited("user.export", "user")
  async export(
    @Query(new ZodValidationPipe(UserExportQuerySchema)) q: UserExportQuery,
    @Res({ passthrough: true }) res: Response
  ) {
    const file = await this.users.export(q)
    res.setHeader("Content-Type", file.contentType)
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.filename}"`
    )
    return new StreamableFile(file.body)
  }

  @ApiOperation({ summary: "Download the CSV import template" })
  @Get("import-template")
  @RequirePermission("users.manage")
  importTemplate(@Res({ passthrough: true }) res: Response) {
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="users-import-template.csv"'
    )
    return new StreamableFile(this.users.importTemplate())
  }

  @ApiOperation({ summary: "Validate a CSV import without creating users" })
  @Post("import/preview")
  @HttpCode(200)
  @RequirePermission("users.manage")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 1_000_000 } }))
  previewImport(@UploadedFile() file?: { buffer: Buffer }) {
    return this.users.previewImport(file?.buffer)
  }

  @ApiOperation({
    summary: "Activate, deactivate, delete or restore many users",
  })
  @Post("bulk")
  @HttpCode(200)
  @RequirePermission("users.manage")
  @Audited("user.bulk", "user")
  bulk(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(BulkUserActionSchema)) body: BulkUserAction
  ) {
    return this.users.bulk(actor.id, body)
  }

  @ApiOperation({
    summary: "Import users from CSV (email,fullName,role); each is invited",
  })
  @Post("import")
  @RequirePermission("users.manage")
  @Audited("user.import", "user")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 1_000_000 } }))
  import(@UploadedFile() file?: { buffer: Buffer }) {
    return this.users.import(file?.buffer)
  }

  @ApiOperation({ summary: "Get user" })
  @Get(":id")
  @RequirePermission("users.manage")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.users.get(id)
  }

  @ApiOperation({ summary: "Create user with initial password" })
  @Post()
  @RequirePermission("users.manage")
  @Audited("user.create", "user")
  create(
    @Body(new ZodValidationPipe(CreateUserRequestSchema))
    body: CreateUserRequest
  ) {
    return this.users.create(body)
  }

  @ApiOperation({ summary: "Update name, role or active status" })
  @Patch(":id")
  @RequirePermission("users.manage")
  @Audited("user.update", "user")
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateUserRequestSchema))
    body: UpdateUserRequest
  ) {
    return this.users.update(actor.id, id, body)
  }

  @ApiOperation({ summary: "Resend invite email" })
  @Post(":id/invite")
  @HttpCode(204)
  @RequirePermission("users.manage")
  @Audited("user.invite", "user")
  async resendInvite(@Param("id", ParseUUIDPipe) id: string) {
    await this.users.resendInvite(id)
  }

  @ApiOperation({ summary: "Set a new password and revoke all sessions" })
  @Post(":id/reset-password")
  @HttpCode(204)
  @RequirePermission("users.manage")
  @Audited("user.reset_password", "user")
  async resetPassword(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ResetUserPasswordRequestSchema))
    body: ResetUserPasswordRequest
  ) {
    await this.users.resetPassword(id, body.password)
  }

  @ApiOperation({ summary: "Soft-delete user and revoke sessions" })
  @Delete(":id")
  @RequirePermission("users.manage")
  @Audited("user.delete", "user")
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.users.remove(actor.id, id)
  }

  @ApiOperation({ summary: "Restore a soft-deleted user" })
  @Post(":id/restore")
  @RequirePermission("users.manage")
  @Audited("user.restore", "user")
  restore(@Param("id", ParseUUIDPipe) id: string) {
    return this.users.restore(id)
  }
}
