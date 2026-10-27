import { Inject, Injectable } from "@nestjs/common"
import type { MeResponse } from "@workspace/contracts"
import { PrismaService } from "../../../../common/prisma/prisma.service"
import { StorageService } from "../../../../common/storage/storage.service"
import {
  ROLE_PERMISSION_QUERY,
  RolePermissionQueryPort,
} from "../../../../common/rbac/scope.types"
import { SessionUserNotFoundError } from "../../domain/errors/auth.errors"

@Injectable()
export class GetMeUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Inject(ROLE_PERMISSION_QUERY)
    private readonly rolePermissionQuery: RolePermissionQueryPort
  ) {}

  async execute(input: { userId: string }): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      include: { role: true },
    })
    if (!user || !user.isActive || !user.passwordHash) {
      throw new SessionUserNotFoundError()
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: this.storage.urlOf(user.avatarKey),
      roleId: user.roleId,
      roleName: user.role.name,
      emailVerified: user.emailVerifiedAt !== null,
      permissions: (await this.rolePermissionQuery.findByRoleId(
        user.roleId
      )) as MeResponse["permissions"],
    }
  }
}
