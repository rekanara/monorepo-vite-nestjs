import { SECURITY_POLICY } from "@workspace/contracts"
import type { Request, Response } from "express"

export const REFRESH_TOKEN_COOKIE = "refresh_token"
const REFRESH_TOKEN_MAX_AGE_MS = SECURITY_POLICY.refreshTokenTtlMs

export function setRefreshTokenCookie(
  res: Pick<Response, "cookie">,
  token: string
): void {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  })
}

export function clearRefreshTokenCookie(
  res: Pick<Response, "clearCookie">
): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: "/api/v1/auth" })
}

// Native apps have no cookie jar worth trusting (and Secure cookies need HTTPS),
// so `X-Client: mobile` swaps the cookie for a refreshToken in the JSON body.
export const isMobileClient = (req: Pick<Request, "header">): boolean =>
  req.header("x-client")?.toLowerCase() === "mobile"

/** Cookie for browsers; `{ refreshToken }` to merge into the body for mobile. */
export function deliverRefreshToken(
  req: Pick<Request, "header">,
  res: Pick<Response, "cookie">,
  token: string
): { refreshToken?: string } {
  if (isMobileClient(req)) return { refreshToken: token }
  setRefreshTokenCookie(res, token)
  return {}
}

export function readRefreshToken(
  req: Pick<Request, "header" | "cookies" | "body">
): string | undefined {
  const token = isMobileClient(req)
    ? req.body?.refreshToken
    : req.cookies?.[REFRESH_TOKEN_COOKIE]
  return typeof token === "string" && token ? token : undefined
}
