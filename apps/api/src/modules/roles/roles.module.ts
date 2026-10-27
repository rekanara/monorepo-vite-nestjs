import { Global, Module } from "@nestjs/common"
import { ROLE_PERMISSION_QUERY } from "../../common/rbac/scope.types"
import { ScopeResolver } from "../../common/rbac/scope-resolver"
import { PermissionGuard } from "../../common/rbac/permission-guard"
import { ROLE_REPOSITORY } from "./domain/role-repository.port"
import { PrismaRoleRepository } from "./infrastructure/prisma-role.repository"
import { RolesService } from "./application/roles.service"
import { RolesController } from "./interface/roles.controller"

// Global so any module can use PermissionGuard without re-importing this one.
@Global()
@Module({
  controllers: [RolesController],
  providers: [
    RolesService,
    PrismaRoleRepository,
    { provide: ROLE_REPOSITORY, useExisting: PrismaRoleRepository },
    { provide: ROLE_PERMISSION_QUERY, useExisting: PrismaRoleRepository },
    ScopeResolver,
    PermissionGuard,
  ],
  exports: [ROLE_PERMISSION_QUERY, ScopeResolver, PermissionGuard],
})
export class RolesModule {}
