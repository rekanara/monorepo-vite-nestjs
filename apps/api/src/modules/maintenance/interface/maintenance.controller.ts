import { Controller, Post, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger"
import { PermissionGuard } from "../../../common/rbac/permission-guard"
import { RequirePermission } from "../../../common/rbac/require-permission.decorator"
import { MaintenanceService } from "../application/maintenance.service"

@ApiTags("System")
@ApiBearerAuth("JWT-auth")
@Controller("system/maintenance")
@UseGuards(PermissionGuard)
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @ApiOperation({ summary: "Run cleanup now" })
  @Post("cleanup")
  @RequirePermission("settings.manage")
  runCleanup() {
    return this.maintenance.run()
  }
}
