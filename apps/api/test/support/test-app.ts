import { Test } from "@nestjs/testing"
import type { INestApplication } from "@nestjs/common"
import cookieParser from "cookie-parser"
import * as argon2 from "argon2"
import { PERMISSIONS } from "@workspace/contracts"
import { AppModule } from "../../src/app.module"
import { PrismaService } from "../../src/common/prisma/prisma.service"
import { MAILER, type MailMessage } from "../../src/common/mailer/mailer.port"
import { OBJECT_STORAGE } from "../../src/common/storage/object-storage.port"
import { generateId } from "../../src/common/ids/id-generator"
import { REDIS } from "../../src/common/redis/redis.tokens"
import { PUSH_NOTIFIER } from "../../src/common/push/push-notifier.port"
import { PAYMENT_GATEWAY } from "../../src/common/payment/payment-gateway.port"

/** Tokens handed to the fake push notifier, in send order. */
export const sentPush: string[][] = []

export const sentMail: MailMessage[] = []

// Minimal in-memory Redis covering what CacheService/health use (TTL ignored).
export const fakeRedisStore = new Map<string, string>()
const fakeRedis = {
  status: "ready",
  connect: async () => undefined,
  disconnect: () => undefined,
  ping: async () => "PONG",
  get: async (k: string) => fakeRedisStore.get(k) ?? null,
  set: async (k: string, v: string) => void fakeRedisStore.set(k, v),
  del: async (...keys: string[]) =>
    keys.filter((k) => fakeRedisStore.delete(k)).length,
}

// Prisma only ever sees DATABASE_URL; tests point it at postgres_test (DB_TEST_*).
function useTestDatabase(): void {
  const e = process.env
  e.DATABASE_URL = `postgresql://${e.DB_TEST_USER ?? "app"}:${e.DB_TEST_PASSWORD ?? "app"}@${e.DB_TEST_HOST ?? "localhost"}:${e.DB_TEST_PORT ?? "5433"}/${e.DB_TEST_NAME ?? "app_test"}`
  e.THROTTLE_LIMIT = "100000"
  e.LOGIN_THROTTLE_LIMIT = "100000"
  e.WEBHOOK_THROTTLE_LIMIT = "100000"
  e.LOG_LEVEL ??= "silent"
}

export async function buildTestApp(): Promise<{
  app: INestApplication
  prisma: PrismaService
}> {
  useTestDatabase()
  sentMail.length = 0
  sentPush.length = 0
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MAILER)
    .useValue({ send: async (m: MailMessage) => void sentMail.push(m) })
    .overrideProvider(PUSH_NOTIFIER)
    .useValue({
      enabled: true,
      send: async (tokens: string[]) => {
        sentPush.push(tokens)
        return {
          successCount: tokens.length,
          failureCount: 0,
          invalidTokens: [],
        }
      },
    })
    .overrideProvider(PAYMENT_GATEWAY)
    .useValue({
      enabled: true,
      createPayment: async () => ({
        token: "token",
        redirectUrl: "https://pay.test",
      }),
      verifyNotification: (body: Record<string, string>) =>
        body.signature_key === "a".repeat(128),
    })
    .overrideProvider(REDIS)
    .useValue(fakeRedis)
    .overrideProvider(OBJECT_STORAGE)
    .useValue({
      enabled: true,
      put: async () => undefined,
      get: async () => null,
      delete: async () => undefined,
      getSignedUrl: async (key: string) => `https://files.test/${key}`,
      publicUrl: (key: string) => `https://files.test/${key}`,
    })
    .compile()
  const app = moduleRef.createNestApplication()
  app.use(cookieParser())
  app.setGlobalPrefix("api/v1")
  await app.listen(0, "127.0.0.1")
  return { app, prisma: app.get(PrismaService) }
}

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  fakeRedisStore.clear()
  sentPush.length = 0
  await prisma.webhookEvent.deleteMany()
  await prisma.apiKey.deleteMany()
  await prisma.announcement.deleteMany()
  await prisma.appSetting.deleteMany()
  await prisma.attachment.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.fcmDevice.deleteMany()
  await prisma.userBackupCode.deleteMany()
  await prisma.userTwoFactor.deleteMany()
  await prisma.userToken.deleteMany()
  await prisma.refreshToken.deleteMany()
  await prisma.refreshTokenFamily.deleteMany()
  await prisma.auditLog.deleteMany()
  await prisma.user.deleteMany()
  await prisma.rolePermission.deleteMany()
  await prisma.role.deleteMany()
}

/** Creates a role holding `permissions` (all scope) and a user in it. */
export async function seedUser(
  prisma: PrismaService,
  opts: {
    email: string
    password?: string
    permissions?: readonly { resource: string; action: string }[]
    isSystem?: boolean
  }
) {
  const role = await prisma.role.create({
    data: {
      id: generateId(),
      name: `role-${opts.email}`,
      isSystem: opts.isSystem ?? false,
      permissions: {
        create: (opts.permissions ?? []).map((p) => ({
          id: generateId(),
          resource: p.resource,
          action: p.action,
          scope: "all",
        })),
      },
    },
  })
  const user = await prisma.user.create({
    data: {
      id: generateId(),
      email: opts.email,
      fullName: opts.email,
      roleId: role.id,
      passwordHash: await argon2.hash(opts.password ?? "Password123!", {
        type: argon2.argon2id,
      }),
      emailVerifiedAt: new Date(),
    },
  })
  return { role, user }
}

export const ALL_PERMISSIONS = PERMISSIONS
