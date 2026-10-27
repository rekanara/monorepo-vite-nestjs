import { loadEnv } from "../../../common/config/env.schema"

type LinkEnv =
  "WEB_RESET_PASSWORD_URL" | "WEB_ACCEPT_INVITE_URL" | "WEB_VERIFY_EMAIL_URL"

export function webLink(envKey: LinkEnv, path: string, token: string) {
  const env = loadEnv()
  return `${env[envKey] ?? `${env.CORS_ORIGIN}${path}`}?token=${token}`
}
