import type { RolePermission, RoleResponse } from "@workspace/contracts"

export type RoleView = RoleResponse

export interface RoleRepositoryPort {
  findPage(
    page: number,
    limit: number,
    search?: string
  ): Promise<{ data: RoleView[]; total: number }>
  findById(id: string): Promise<RoleView | null>
  findByName(name: string): Promise<RoleView | null>
  create(input: {
    id: string
    name: string
    description?: string
    requireTwoFactor?: boolean
  }): Promise<RoleView>
  update(
    id: string,
    patch: { name?: string; description?: string; requireTwoFactor?: boolean }
  ): Promise<RoleView>
  delete(id: string): Promise<void>
  replacePermissions(
    id: string,
    permissions: RolePermission[]
  ): Promise<RoleView>
  countHolders(
    resource: string,
    action: string,
    exceptRoleId: string
  ): Promise<number>
}
export const ROLE_REPOSITORY = Symbol("ROLE_REPOSITORY")
