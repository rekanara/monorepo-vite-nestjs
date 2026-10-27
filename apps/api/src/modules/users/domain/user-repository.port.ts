import type { UserListQuery, UserResponse } from "@workspace/contracts"

export interface UserRepositoryPort {
  findPage(
    query: UserListQuery
  ): Promise<{ data: UserResponse[]; total: number }>
  findById(id: string): Promise<UserResponse | null>
  create(input: {
    id: string
    email: string
    fullName: string
    roleId: string
    passwordHash: string | null
  }): Promise<UserResponse>
  update(
    id: string,
    patch: { fullName?: string; roleId?: string; isActive?: boolean }
  ): Promise<UserResponse>
  setPasswordHash(id: string, passwordHash: string): Promise<void>
  setDeleted(id: string, deletedAt: Date | null): Promise<UserResponse>
  findForExport(
    filter: Omit<UserListQuery, "page" | "limit">
  ): Promise<UserResponse[]>
  roleIdsByName(): Promise<Map<string, string>>
  existingEmails(emails: string[]): Promise<Set<string>>
  roleExists(roleId: string): Promise<boolean>
}
export const USERS_REPOSITORY = Symbol("USERS_REPOSITORY")
