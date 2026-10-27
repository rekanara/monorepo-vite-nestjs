import { PasswordSchema } from "@workspace/contracts"
import { z } from "zod"

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v)
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional())
const optionalString = z.preprocess(emptyToUndefined, z.string().optional())

// DATABASE_URL must stay a literal (Prisma CLI reads it directly).
// REDIS_URL is derived from REDIS_* below and never read from the environment.
export const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.url(),
  WEB_RESET_PASSWORD_URL: optionalUrl,
  WEB_ACCEPT_INVITE_URL: optionalUrl,
  WEB_VERIFY_EMAIL_URL: optionalUrl,
  DATABASE_URL: z.url(),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: optionalString,
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),
  JWT_ACCESS_SECRET: z.string().min(32),
  REFRESH_TOKEN_PEPPER: z.string().min(16),
  SUPER_ADMIN_EMAIL: z.email(),
  SUPER_ADMIN_PASSWORD: PasswordSchema,
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USERNAME: optionalString,
  SMTP_PASSWORD: optionalString,
  SMTP_FROM: z.email(),
  // Object storage. Without keys, StorageService.enabled is false.
  MINIO_ENDPOINT: optionalString,
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_ACCESS_KEY: optionalString,
  MINIO_SECRET_KEY: optionalString,
  MINIO_BUCKET: z.string().default("app"),
  MINIO_USE_SSL: z.enum(["true", "false"]).default("false"),
  // Browser-facing address when it differs from MINIO_ENDPOINT (e.g. a proxy).
  MINIO_PUBLIC_ENDPOINT: optionalUrl,
  // Base URL of public files (CDN). Defaults to <public endpoint>/<bucket>.
  STORAGE_PUBLIC_URL: optionalUrl,
  // Payment gateway. Without a server key, PaymentGateway.enabled is false.
  MIDTRANS_SERVER_KEY: optionalString,
  MIDTRANS_CLIENT_KEY: optionalString,
  MIDTRANS_IS_PRODUCTION: z.enum(["true", "false"]).default("false"),
  // Observability. Empty DSN disables Sentry.
  SENTRY_DSN: optionalUrl,
  SENTRY_ENVIRONMENT: optionalString,
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
})
export type Env = z.infer<typeof EnvSchema> & { REDIS_URL: string }

export function buildRedisUrl(parts: {
  REDIS_HOST: string
  REDIS_PORT: number
  REDIS_PASSWORD?: string
  REDIS_DB: number
}): string {
  const auth = parts.REDIS_PASSWORD
    ? `:${encodeURIComponent(parts.REDIS_PASSWORD)}@`
    : ""
  return `redis://${auth}${parts.REDIS_HOST}:${parts.REDIS_PORT}/${parts.REDIS_DB}`
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source)
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${parsed.error.message}`
    )
  }
  return { ...parsed.data, REDIS_URL: buildRedisUrl(parsed.data) }
}
