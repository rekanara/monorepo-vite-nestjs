import { Injectable } from "@nestjs/common"
import type { Prisma } from "@prisma/client"
import type { RolePermission } from "@workspace/contracts"
import { PrismaService } from "../../../common/prisma/prisma.service"
import { generateId } from "../../../common/ids/id-generator"
import { CacheService } from "../../../common/redis/cache.service"
import type {
  RolePermissionQueryPort,
  RolePermissionRow,
} from "../../../common/rbac/scope.types"
import type {
  RoleRepositoryPort,
  RoleView,
} from "../domain/role-repository.port"

const include = {
  permissions: { orderBy: [{ resource: "asc" }, { action: "asc" }] },
  _count: { select: { users: true } },
} satisfies Prisma.RoleInclude

type RoleRow = Prisma.RoleGetPayload<{ include: typeof include }>

const toView = (r: RoleRow): RoleView => ({
  id: r.id,
  name: r.name,
  description: r.description,
  isSystem: r.isSystem,
  requireTwoFactor: r.requireTwoFactor,
  userCount: r._count.users,
  permissions: r.permissions.map((p) => ({
    resource: p.resource,
    action: p.action,
    scope: p.scope,
  })) as RolePermission[],
})

@Injectable()
export class PrismaRoleRepository
  implements RoleRepositoryPort, RolePermissionQueryPort
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService
  ) {}

  async findPage(page: number, limit: number, search?: string) {
    const where: Prisma.RoleWhereInput = search
      ? { name: { contains: search, mode: "insensitive" } }
      : {}
    const [rows, total] = await Promise.all([
      this.prisma.role.findMany({
        where,
        include,
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.role.count({ where }),
    ])
    return { data: rows.map(toView), total }
  }

  async findById(id: string) {
    const row = await this.prisma.role.findUnique({ where: { id }, include })
    return row && toView(row)
  }

  async findByName(name: string) {
    const row = await this.prisma.role.findUnique({ where: { name }, include })
    return row && toView(row)
  }

  async create(input: {
    id: string
    name: string
    description?: string
    requireTwoFactor?: boolean
  }) {
    return toView(await this.prisma.role.create({ data: input, include }))
  }

  async update(
    id: string,
    patch: { name?: string; description?: string; requireTwoFactor?: boolean }
  ) {
    return toView(
      await this.prisma.role.update({ where: { id }, data: patch, include })
    )
  }

  async delete(id: string) {
    await this.prisma.role.delete({ where: { id } })
    await this.cache.del(this.permissionCacheKey(id))
  }

  async replacePermissions(id: string, permissions: RolePermission[]) {
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ id: generateId(), roleId: id, ...p })),
      }),
    ])
    await this.cache.del(this.permissionCacheKey(id))
    return (await this.findById(id))!
  }

  countHolders(resource: string, action: string, exceptRoleId: string) {
    return this.prisma.rolePermission.count({
      where: { resource, action, roleId: { not: exceptRoleId } },
    })
  }

  findByRoleId(roleId: string): Promise<RolePermissionRow[]> {
    return this.cache.wrap(this.permissionCacheKey(roleId), 60, async () => {
      const rows = await this.prisma.rolePermission.findMany({
        where: { roleId },
      })
      return rows.map((r) => ({
        resource: r.resource,
        action: r.action,
        scope: r.scope as RolePermissionRow["scope"],
      }))
    })
  }

  private permissionCacheKey(roleId: string): string {
    return `role-permissions:${roleId}`
  }
}
