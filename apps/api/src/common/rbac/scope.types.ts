export type ScopeFilter =
  | { kind: "self"; userId: string }
  | { kind: "team"; userId: string; subordinateUserIds: string[] }
  | { kind: "all" }

export interface RolePermissionRow {
  resource: string
  action: string
  scope: "self" | "team" | "all"
}

export interface RolePermissionQueryPort {
  findByRoleId(roleId: string): Promise<RolePermissionRow[]>
}
export const ROLE_PERMISSION_QUERY = Symbol("ROLE_PERMISSION_QUERY")

export interface TeamHierarchyQueryPort {
  getSubordinateUserIds(userId: string): Promise<string[]>
}
export const TEAM_HIERARCHY_QUERY = Symbol("TEAM_HIERARCHY_QUERY")
