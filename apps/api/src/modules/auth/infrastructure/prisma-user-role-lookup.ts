import { Injectable } from "@nestjs/common"
import { PrismaService } from "../../../common/prisma/prisma.service"
import { InvalidRefreshTokenError } from "../domain/errors/auth.errors"
import {
  UserForRefresh,
  UserRoleLookupPort,
} from "../domain/ports/user-repository.port"

@Injectable()
export class PrismaUserRoleLookup implements UserRoleLookupPort {
  constructor(private readonly prisma: PrismaService) {}

  async getUserForRefresh(userId: string): Promise<UserForRefresh> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { roleId: true, isActive: true },
    })
    // A missing user (deleted after the token was issued) is just another invalid
    // refresh token — throwing the domain error lets the controller clear the cookie.
    if (!row) throw new InvalidRefreshTokenError()
    return { roleId: row.roleId, isActive: row.isActive }
  }
}
