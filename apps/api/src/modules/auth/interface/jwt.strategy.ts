import { Injectable } from "@nestjs/common"
import { PassportStrategy } from "@nestjs/passport"
import { ExtractJwt, Strategy } from "passport-jwt"
import { AccessTokenPayload } from "../domain/ports/token-service.port"
import { loadEnv } from "../../../common/config/env.schema"

export interface AuthenticatedUser {
  id: string
  roleId: string
  sessionId?: string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: loadEnv().JWT_ACCESS_SECRET,
    })
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    return { id: payload.sub, roleId: payload.roleId, sessionId: payload.sid }
  }
}
