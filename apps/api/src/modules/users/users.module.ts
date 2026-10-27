import { Module } from "@nestjs/common"
import { AuthModule } from "../auth/auth.module"
import { USERS_REPOSITORY } from "./domain/user-repository.port"
import { PrismaUsersRepository } from "./infrastructure/prisma-users.repository"
import { UsersService } from "./application/users.service"
import { UsersController } from "./interface/users.controller"

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    { provide: USERS_REPOSITORY, useClass: PrismaUsersRepository },
  ],
})
export class UsersModule {}
