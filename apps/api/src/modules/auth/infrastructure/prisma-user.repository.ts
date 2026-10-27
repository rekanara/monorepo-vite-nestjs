import { Injectable } from "@nestjs/common"
import type { User as UserRow } from "@prisma/client"
import { PrismaService } from "../../../common/prisma/prisma.service"
import { User } from "../domain/entities/user.entity"
import { UserRepositoryPort } from "../domain/ports/user-repository.port"

const toEntity = (row: UserRow) =>
  User.create({
    id: row.id,
    roleId: row.roleId,
    email: row.email,
    passwordHash: row.passwordHash,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt,
    fullName: row.fullName,
    avatarKey: row.avatarKey,
  })

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email } })
    return row && toEntity(row)
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } })
    return row && toEntity(row)
  }

  async updateLastLoginAt(userId: string, at: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: at },
    })
  }
}
