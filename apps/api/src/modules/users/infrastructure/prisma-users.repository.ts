import { Injectable } from "@nestjs/common"
import type { Prisma } from "@prisma/client"
import type { UserListQuery, UserResponse } from "@workspace/contracts"
import { PrismaService } from "../../../common/prisma/prisma.service"
import { StorageService } from "../../../common/storage/storage.service"
import type { UserRepositoryPort } from "../domain/user-repository.port"

// ponytail: exports are built in memory; stream rows when this cap is hit.
export const EXPORT_LIMIT = 10_000

const include = {
  role: { select: { name: true } },
} satisfies Prisma.UserInclude
type UserRow = Prisma.UserGetPayload<{ include: typeof include }>

const toResponse = (
  u: UserRow,
  avatarUrl: (key: string | null) => string | null
): UserResponse => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
  avatarUrl: avatarUrl(u.avatarKey),
  roleId: u.roleId,
  roleName: u.role.name,
  isActive: u.isActive,
  invited: u.passwordHash === null,
  emailVerifiedAt: u.emailVerifiedAt?.toISOString() ?? null,
  deletedAt: u.deletedAt?.toISOString() ?? null,
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  createdAt: u.createdAt.toISOString(),
})

type UserFilter = Omit<UserListQuery, "page" | "limit">

function whereOf({
  search,
  roleId,
  isActive,
  deleted,
}: UserFilter): Prisma.UserWhereInput {
  return {
    roleId,
    isActive,
    deletedAt: deleted ? { not: null } : null,
    ...(search && {
      OR: [
        { email: { contains: search, mode: "insensitive" } },
        { fullName: { contains: search, mode: "insensitive" } },
      ],
    }),
  }
}

function orderOf({
  sort,
  order,
}: UserFilter): Prisma.UserOrderByWithRelationInput[] {
  const first: Prisma.UserOrderByWithRelationInput =
    sort === "fullName" || sort === "lastLoginAt"
      ? { [sort]: { sort: order, nulls: "last" } }
      : { [sort]: order }
  return [first, { id: order }]
}

@Injectable()
export class PrismaUsersRepository implements UserRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async findPage(query: UserListQuery) {
    const { page, limit } = query
    const where = whereOf(query)
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include,
        orderBy: orderOf(query),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ])
    return {
      data: rows.map((row) =>
        toResponse(row, (key) => this.storage.urlOf(key))
      ),
      total,
    }
  }

  async findById(id: string) {
    const row = await this.prisma.user.findUnique({ where: { id }, include })
    return row && toResponse(row, (key) => this.storage.urlOf(key))
  }

  async create(data: {
    id: string
    email: string
    fullName: string
    roleId: string
    passwordHash: string | null
  }) {
    return toResponse(await this.prisma.user.create({ data, include }), (key) =>
      this.storage.urlOf(key)
    )
  }

  async update(
    id: string,
    data: { fullName?: string; roleId?: string; isActive?: boolean }
  ) {
    return toResponse(
      await this.prisma.user.update({ where: { id }, data, include }),
      (key) => this.storage.urlOf(key)
    )
  }

  async setPasswordHash(id: string, passwordHash: string) {
    await this.prisma.user.update({ where: { id }, data: { passwordHash } })
  }

  async setDeleted(id: string, deletedAt: Date | null) {
    return toResponse(
      await this.prisma.user.update({
        where: { id },
        data: { deletedAt, isActive: deletedAt === null },
        include,
      }),
      (key) => this.storage.urlOf(key)
    )
  }

  async findForExport(filter: UserFilter) {
    const rows = await this.prisma.user.findMany({
      where: whereOf(filter),
      include,
      orderBy: orderOf(filter),
      take: EXPORT_LIMIT,
    })
    return rows.map((row) => toResponse(row, (key) => this.storage.urlOf(key)))
  }

  async roleIdsByName() {
    const roles = await this.prisma.role.findMany({
      select: { id: true, name: true },
    })
    return new Map(roles.map((r) => [r.name.toLowerCase(), r.id]))
  }

  async existingEmails(emails: string[]) {
    const rows = await this.prisma.user.findMany({
      where: { email: { in: emails } },
      select: { email: true },
    })
    return new Set(rows.map((r) => r.email))
  }

  async roleExists(roleId: string) {
    return (await this.prisma.role.count({ where: { id: roleId } })) > 0
  }
}
