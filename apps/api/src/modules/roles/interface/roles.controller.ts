import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common"
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger"
import {
  ACTIONS,
  CreateRoleRequestSchema,
  PaginationQuerySchema,
  PERMISSIONS,
  RESOURCES,
  SCOPES,
  SetRolePermissionsRequestSchema,
  UpdateRoleRequestSchema,
  type CreateRoleRequest,
  type PaginationQuery,
  type SetRolePermissionsRequest,
  type UpdateRoleRequest,
} from "@workspace/contracts"
import { PermissionGuard } from "../../../common/rbac/permission-guard"
import { RequirePermission } from "../../../common/rbac/require-permission.decorator"
import { ZodValidationPipe } from "../../../common/pipes/zod-validation.pipe"
import { Audited } from "../../../common/audit/audited.decorator"
import { RolesService } from "../application/roles.service"

@ApiTags("Roles & Permissions")
@ApiBearerAuth("JWT-auth")
@Controller()
@UseGuards(PermissionGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @ApiOperation({ summary: "Permission catalog (from contracts)" })
  @Get("permissions")
  @RequirePermission("permissions.view")
  catalog() {
    return {
      permissions: PERMISSIONS,
      resources: RESOURCES,
      actions: ACTIONS,
      scopes: SCOPES,
    }
  }

  @ApiOperation({ summary: "List roles" })
  @Get("roles")
  @RequirePermission("roles.manage")
  list(
    @Query(new ZodValidationPipe(PaginationQuerySchema)) q: PaginationQuery
  ) {
    return this.roles.list(q.page, q.limit, q.search)
  }

  @ApiOperation({ summary: "Get role with permissions" })
  @Get("roles/:id")
  @RequirePermission("roles.manage")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.roles.get(id)
  }

  @ApiOperation({ summary: "Create role" })
  @Post("roles")
  @RequirePermission("roles.manage")
  @Audited("role.create", "role")
  create(
    @Body(new ZodValidationPipe(CreateRoleRequestSchema))
    body: CreateRoleRequest
  ) {
    return this.roles.create(body)
  }

  @ApiOperation({ summary: "Update role name/description" })
  @Patch("roles/:id")
  @RequirePermission("roles.manage")
  @Audited("role.update", "role")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateRoleRequestSchema))
    body: UpdateRoleRequest
  ) {
    return this.roles.update(id, body)
  }

  @ApiOperation({ summary: "Delete non-system role without users" })
  @Delete("roles/:id")
  @RequirePermission("roles.manage")
  @Audited("role.delete", "role")
  delete(@Param("id", ParseUUIDPipe) id: string) {
    return this.roles.delete(id)
  }

  @ApiOperation({ summary: "Replace role permissions" })
  @Put("roles/:id/permissions")
  @RequirePermission("roles.manage")
  @Audited("role.permissions.set", "role")
  setPermissions(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetRolePermissionsRequestSchema))
    body: SetRolePermissionsRequest
  ) {
    return this.roles.setPermissions(id, body.permissions)
  }
}
