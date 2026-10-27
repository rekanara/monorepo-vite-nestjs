import { Inject, Injectable, Optional } from "@nestjs/common"
import { DomainException } from "../errors/domain-exception"
import {
  ROLE_PERMISSION_QUERY,
  RolePermissionQueryPort,
  ScopeFilter,
  TEAM_HIERARCHY_QUERY,
  TeamHierarchyQueryPort,
} from "./scope.types"

export class TeamScopeUnavailableError extends DomainException {
  constructor() {
    super({
      code: "TEAM_SCOPE_UNAVAILABLE",
      title: "Team scope requires a hierarchy provider",
      status: 403,
    })
  }
}

export class PermissionNotGrantedError extends DomainException {
  constructor(permission: string) {
    super({
      code: "PERMISSION_NOT_GRANTED",
      title: `Permission not granted: ${permission}`,
      status: 403,
    })
  }
}

export interface CurrentUserRef {
  id: string
  roleId: string
}

@Injectable()
export class ScopeResolver {
  constructor(
    @Inject(ROLE_PERMISSION_QUERY)
    private readonly rolePermissionQuery: RolePermissionQueryPort,
    @Optional()
    @Inject(TEAM_HIERARCHY_QUERY)
    private readonly teamHierarchyQuery?: TeamHierarchyQueryPort
  ) {}

  async resolve(
    user: CurrentUserRef,
    permission: string
  ): Promise<ScopeFilter> {
    const [resource, action] = permission.split(".")
    const rows = await this.rolePermissionQuery.findByRoleId(user.roleId)
    const row = rows.find((r) => r.resource === resource && r.action === action)
    if (!row) throw new PermissionNotGrantedError(permission)
    if (row.scope === "all") return { kind: "all" }
    if (row.scope === "team") {
      if (!this.teamHierarchyQuery) throw new TeamScopeUnavailableError()
      return {
        kind: "team",
        userId: user.id,
        subordinateUserIds: await this.teamHierarchyQuery.getSubordinateUserIds(
          user.id
        ),
      }
    }
    return { kind: "self", userId: user.id }
  }
}
