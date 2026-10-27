import { Module } from "@nestjs/common"
import { JwtModule } from "@nestjs/jwt"
import { PassportModule } from "@nestjs/passport"
import { AuthController } from "./interface/auth.controller"
import { JwtStrategy } from "./interface/jwt.strategy"
import { LoginUseCase } from "./application/use-cases/login.use-case"
import { RefreshTokenUseCase } from "./application/use-cases/refresh-token.use-case"
import { LogoutUseCase } from "./application/use-cases/logout.use-case"
import { GetMeUseCase } from "./application/use-cases/get-me.use-case"
import { PasswordResetUseCase } from "./application/use-cases/password-reset.use-case"
import { InviteUseCase } from "./application/use-cases/invite.use-case"
import { UserTokenService } from "./application/user-token.service"
import { TwoFactorService } from "./application/two-factor.service"
import { BackupCodeService } from "./application/backup-code.service"
import {
  USER_REPOSITORY,
  USER_ROLE_LOOKUP,
} from "./domain/ports/user-repository.port"
import { REFRESH_TOKEN_REPOSITORY } from "./domain/ports/refresh-token-repository.port"
import { PASSWORD_HASHER } from "./domain/ports/password-hasher.port"
import { TOKEN_SERVICE } from "./domain/ports/token-service.port"
import { PrismaUserRepository } from "./infrastructure/prisma-user.repository"
import { PrismaRefreshTokenRepository } from "./infrastructure/prisma-refresh-token.repository"
import { PrismaUserRoleLookup } from "./infrastructure/prisma-user-role-lookup"
import { Argon2PasswordHasher } from "./infrastructure/argon2-password-hasher"
import { JwtTokenService } from "./infrastructure/jwt-token.service"
import { loadEnv } from "../../common/config/env.schema"
import { MailerModule } from "../../common/mailer/mailer.module"
import { PrismaModule } from "../../common/prisma/prisma.module"
import { RolesModule } from "../roles/roles.module"

@Module({
  imports: [
    PassportModule,
    JwtModule.register({ secret: loadEnv().JWT_ACCESS_SECRET }),
    RolesModule,
    PrismaModule,
    MailerModule,
  ],
  controllers: [AuthController],
  providers: [
    JwtStrategy,
    LoginUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    GetMeUseCase,
    PasswordResetUseCase,
    InviteUseCase,
    UserTokenService,
    TwoFactorService,
    BackupCodeService,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useClass: PrismaRefreshTokenRepository,
    },
    { provide: USER_ROLE_LOOKUP, useClass: PrismaUserRoleLookup },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
  ],
  exports: [
    PASSWORD_HASHER,
    REFRESH_TOKEN_REPOSITORY,
    InviteUseCase,
    TwoFactorService,
    BackupCodeService,
  ],
})
export class AuthModule {}
