import { User } from "../entities/user.entity"

export interface UserRepositoryPort {
  findByEmail(email: string): Promise<User | null>
  findById(id: string): Promise<User | null>
  updateLastLoginAt(userId: string, at: Date): Promise<void>
}
export const USER_REPOSITORY = Symbol("USER_REPOSITORY")

export interface UserForRefresh {
  roleId: string
  isActive: boolean
}

export interface UserRoleLookupPort {
  getUserForRefresh(userId: string): Promise<UserForRefresh>
}
export const USER_ROLE_LOOKUP = Symbol("USER_ROLE_LOOKUP")
