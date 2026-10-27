import { Inject, Injectable } from "@nestjs/common"
import type {
  CreateRoleRequest,
  RolePermission,
  UpdateRoleRequest,
} from "@workspace/contracts"
import { generateId } from "../../../common/ids/id-generator"
import { Paged } from "../../../common/http/response-envelope.interceptor"
import { isUniqueConstraintViolation } from "../../../common/errors/prisma-error.util"
import { droppedGuardedPermissions } from "../domain/guarded-permissions"
import {
  ROLE_REPOSITORY,
  type RoleRepositoryPort,
  type RoleView,
} from "../domain/role-repository.port"
import {
  LastPermissionHolderError,
  RoleInUseError,
  RoleNameTakenError,
  RoleNotFoundError,
  SystemRoleImmutableError,
} from "../domain/roles.errors"

@Injectable()
export class RolesService {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepositoryPort
  ) {}

  async list(page: number, limit: number, search?: string) {
    const { data, total } = await this.roles.findPage(page, limit, search)
    return Paged.of(data, total, page, limit)
  }

  async get(id: string): Promise<RoleView> {
    const role = await this.roles.findById(id)
    if (!role) throw new RoleNotFoundError()
    return role
  }

  async create(input: CreateRoleRequest): Promise<RoleView> {
    return this.uniqueName(() =>
      this.roles.create({ id: generateId(), ...input })
    )
  }

  async update(id: string, patch: UpdateRoleRequest): Promise<RoleView> {
    const role = await this.get(id)
    if (role.isSystem && patch.name && patch.name !== role.name) {
      throw new SystemRoleImmutableError()
    }
    return this.uniqueName(() => this.roles.update(id, patch))
  }

  async delete(id: string): Promise<{ id: string }> {
    const role = await this.get(id)
    if (role.isSystem) throw new SystemRoleImmutableError()
    if (role.userCount > 0) throw new RoleInUseError()
    await this.roles.delete(id)
    return { id }
  }

  async setPermissions(
    id: string,
    permissions: RolePermission[]
  ): Promise<RoleView> {
    const role = await this.get(id)
    if (role.isSystem) throw new SystemRoleImmutableError()
    for (const key of droppedGuardedPermissions(
      role.permissions,
      permissions
    )) {
      const [resource, action] = key.split(".") as [string, string]
      if ((await this.roles.countHolders(resource, action, id)) === 0) {
        throw new LastPermissionHolderError(key)
      }
    }
    return this.roles.replacePermissions(id, permissions)
  }

  private async uniqueName<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write()
    } catch (err) {
      if (isUniqueConstraintViolation(err, "name"))
        throw new RoleNameTakenError()
      throw err
    }
  }
}
