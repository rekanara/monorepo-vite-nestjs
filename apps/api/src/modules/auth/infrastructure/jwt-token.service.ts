import { randomBytes, createHmac } from "node:crypto"
import { SECURITY_POLICY } from "@workspace/contracts"
import { Injectable } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import { loadEnv } from "../../../common/config/env.schema"
import {
  AccessTokenPayload,
  TokenServicePort,
} from "../domain/ports/token-service.port"

const ACCESS_TOKEN_TTL_SECONDS = SECURITY_POLICY.accessTokenTtlMs / 1000

@Injectable()
export class JwtTokenService implements TokenServicePort {
  // Server-side secret keying the refresh-token hash, so a leaked DB dump alone
  // cannot be used to verify guessed tokens offline.
  private readonly refreshTokenPepper = loadEnv().REFRESH_TOKEN_PEPPER

  constructor(private readonly jwt: JwtService) {}

  signAccessToken(payload: AccessTokenPayload): {
    token: string
    expiresInSeconds: number
  } {
    const token = this.jwt.sign(payload, {
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    })
    return { token, expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS }
  }

  generateOpaqueRefreshToken(): string {
    return randomBytes(48).toString("base64url")
  }

  hashRefreshToken(plain: string): string {
    return createHmac("sha256", this.refreshTokenPepper)
      .update(plain)
      .digest("hex")
  }
}
