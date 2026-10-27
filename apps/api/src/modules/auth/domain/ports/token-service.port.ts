export interface AccessTokenPayload {
  sub: string
  roleId: string
  sid?: string
}

export interface TokenServicePort {
  signAccessToken(payload: AccessTokenPayload): {
    token: string
    expiresInSeconds: number
  }
  generateOpaqueRefreshToken(): string
  hashRefreshToken(plain: string): string
}

export const TOKEN_SERVICE = Symbol("TOKEN_SERVICE")
