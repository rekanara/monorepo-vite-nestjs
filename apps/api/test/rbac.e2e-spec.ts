import { afterAll, beforeEach, describe, expect, it } from "vitest"
import request from "supertest"
import { authenticator } from "otplib"
import type { INestApplication } from "@nestjs/common"
import type { PrismaService } from "../src/common/prisma/prisma.service"
import {
  ALL_PERMISSIONS,
  buildTestApp,
  resetDatabase,
  seedUser,
  sentMail,
  sentPush,
} from "./support/test-app"
import { generateId } from "../src/common/ids/id-generator"

const PASSWORD = "Password123!"
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])

describe("auth + RBAC (e2e)", async () => {
  const { app, prisma } = (await buildTestApp()) as {
    app: INestApplication
    prisma: PrismaService
  }
  const http = () => request(app.getHttpServer())

  async function login(email: string) {
    const res = await http()
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD })
      .expect(201)
    return {
      token: res.body.data.accessToken as string,
      cookie: res.headers["set-cookie"] as unknown as string[],
    }
  }

  beforeEach(() => resetDatabase(prisma))
  afterAll(() => app.close())

  it("health is public", async () => {
    const res = await http().get("/api/v1/health").expect(200)
    expect(res.body.data).toEqual({ status: "ok" })
    expect(res.body.status).toMatchObject({
      code: 200,
      name: "OK",
      type: "SUCCESS",
      message: "OK",
      messageInd: "OK",
    })
    expect(res.body.status.timeStamp).toMatch(/\+07:00$/)
  })

  it("rejects unauthenticated access to guarded routes", async () => {
    const res = await http().get("/api/v1/users").expect(401)
    expect(res.body).toMatchObject({
      data: null,
      status: { code: 401, type: "ERROR", name: "Unauthorized" },
    })
  })

  it("denies a user without the permission and allows one with it", async () => {
    await seedUser(prisma, { email: "none@test.local" })
    await seedUser(prisma, {
      email: "admin@test.local",
      permissions: ALL_PERMISSIONS,
    })
    const none = await login("none@test.local")
    const admin = await login("admin@test.local")

    const denied = await http()
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${none.token}`)
      .expect(403)
    expect(denied.body.error.code).toBe("PERMISSION_NOT_GRANTED")
    expect(denied.body.status.messageInd).toBe("Permission tidak diberikan")

    const ok = await http()
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200)
    expect(ok.body.data).toHaveLength(2)
    expect(ok.body.meta).toEqual({
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1,
    })

    const filtered = await http()
      .get("/api/v1/users")
      .query({ roleId: ok.body.data[0].roleId, isActive: true })
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(200)
    expect(filtered.body.data).toHaveLength(1)
    expect(filtered.body.data[0].roleId).toBe(ok.body.data[0].roleId)
  })

  it("requires role-based two-factor setup before issuing session", async () => {
    await seedUser(prisma, {
      email: "totp@test.local",
      permissions: [{ resource: "users", action: "manage" }],
    })
    const role = await prisma.role.findFirstOrThrow({
      where: { users: { some: { email: "totp@test.local" } } },
    })
    await prisma.role.update({
      where: { id: role.id },
      data: { requireTwoFactor: true },
    })
    const challenged = await http()
      .post("/api/v1/auth/login")
      .send({ email: "totp@test.local", password: PASSWORD })
      .expect(201)
    expect(challenged.body.data).toMatchObject({
      requiresTwoFactor: true,
      setupRequired: true,
    })
    expect(challenged.headers["set-cookie"]).toBeUndefined()
    const code = authenticator.generate(challenged.body.data.manualKey)
    const verified = await http()
      .post("/api/v1/auth/2fa/verify")
      .send({ challengeToken: challenged.body.data.challengeToken, code })
      .expect(201)
    expect(verified.body.data.requiresTwoFactor).toBe(false)
    expect(verified.body.data.accessToken).toBeTruthy()
    expect(verified.headers["set-cookie"]).toBeTruthy()
    expect(verified.body.data.backupCodes).toHaveLength(10)
  })

  it("issues backup codes once, logs in with one, manages 2FA from account", async () => {
    await seedUser(prisma, {
      email: "totp2@test.local",
      permissions: [{ resource: "users", action: "manage" }],
    })
    const role = await prisma.role.findFirstOrThrow({
      where: { users: { some: { email: "totp2@test.local" } } },
    })
    await prisma.role.update({
      where: { id: role.id },
      data: { requireTwoFactor: true },
    })
    const challenged = await http()
      .post("/api/v1/auth/login")
      .send({ email: "totp2@test.local", password: PASSWORD })
      .expect(201)
    const code = authenticator.generate(challenged.body.data.manualKey)
    const verified = await http()
      .post("/api/v1/auth/2fa/verify")
      .send({ challengeToken: challenged.body.data.challengeToken, code })
      .expect(201)
    const backupCodes = verified.body.data.backupCodes as string[]
    const { token } = { token: verified.body.data.accessToken as string }

    const status = await http()
      .get("/api/v1/account/two-factor")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
    expect(status.body.data).toMatchObject({
      enabled: true,
      required: true,
      backupCodesRemaining: 10,
    })

    // A re-challenge then login using a backup code instead of TOTP.
    const challenged2 = await http()
      .post("/api/v1/auth/login")
      .send({ email: "totp2@test.local", password: PASSWORD })
      .expect(201)
    await http()
      .post("/api/v1/auth/2fa/verify-backup")
      .send({
        challengeToken: challenged2.body.data.challengeToken,
        backupCode: "not-a-real-code",
      })
      .expect(401)
    const viaBackup = await http()
      .post("/api/v1/auth/2fa/verify-backup")
      .send({
        challengeToken: challenged2.body.data.challengeToken,
        backupCode: backupCodes[0],
      })
      .expect(201)
    expect(viaBackup.body.data.accessToken).toBeTruthy()

    // The spent code cannot be reused.
    const challenged3 = await http()
      .post("/api/v1/auth/login")
      .send({ email: "totp2@test.local", password: PASSWORD })
      .expect(201)
    await http()
      .post("/api/v1/auth/2fa/verify-backup")
      .send({
        challengeToken: challenged3.body.data.challengeToken,
        backupCode: backupCodes[0],
      })
      .expect(401)

    const regenerated = await http()
      .post("/api/v1/account/two-factor/backup-codes")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: PASSWORD })
      .expect(200)
    expect(regenerated.body.data.backupCodes).toHaveLength(10)
    expect(regenerated.body.data.backupCodes).not.toContain(backupCodes[1])

    await http()
      .post("/api/v1/account/two-factor/reset")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "wrong-password" })
      .expect(401)
    await http()
      .post("/api/v1/account/two-factor/reset")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: PASSWORD })
      .expect(204)

    const statusAfterReset = await http()
      .get("/api/v1/account/two-factor")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
    expect(statusAfterReset.body.data).toMatchObject({
      enabled: false,
      backupCodesRemaining: 0,
    })

    // Next login re-enrols from scratch (new QR/manual key).
    const challenged4 = await http()
      .post("/api/v1/auth/login")
      .send({ email: "totp2@test.local", password: PASSWORD })
      .expect(201)
    expect(challenged4.body.data.setupRequired).toBe(true)
  })

  it("lets a user without role-required 2FA opt in and out from account", async () => {
    await seedUser(prisma, { email: "optin@test.local" })
    const { token } = await login("optin@test.local")

    const before = await http()
      .get("/api/v1/account/two-factor")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
    expect(before.body.data).toMatchObject({ enabled: false, required: false })

    const setup = await http()
      .post("/api/v1/account/two-factor/setup")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
    expect(setup.body.data.manualKey).toBeTruthy()

    await http()
      .post("/api/v1/account/two-factor/enable")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "000000" })
      .expect(401)

    const code = authenticator.generate(setup.body.data.manualKey)
    const enabled = await http()
      .post("/api/v1/account/two-factor/enable")
      .set("Authorization", `Bearer ${token}`)
      .send({ code })
      .expect(200)
    expect(enabled.body.data.backupCodes).toHaveLength(10)

    // Login now challenges even though the role doesn't require it.
    const challenged = await http()
      .post("/api/v1/auth/login")
      .send({ email: "optin@test.local", password: PASSWORD })
      .expect(201)
    expect(challenged.body.data).toMatchObject({
      requiresTwoFactor: true,
      setupRequired: false,
    })
    const loginCode = authenticator.generate(setup.body.data.manualKey)
    await http()
      .post("/api/v1/auth/2fa/verify")
      .send({
        challengeToken: challenged.body.data.challengeToken,
        code: loginCode,
      })
      .expect(201)

    await http()
      .post("/api/v1/account/two-factor/disable")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: PASSWORD })
      .expect(204)

    const after = await http()
      .get("/api/v1/account/two-factor")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
    expect(after.body.data.enabled).toBe(false)

    // Login no longer challenges.
    await http()
      .post("/api/v1/auth/login")
      .send({ email: "optin@test.local", password: PASSWORD })
      .expect(201)
      .expect((res) => {
        if (res.body.data.requiresTwoFactor)
          throw new Error("should not challenge")
      })
  })

  it("blocks disabling 2FA when the role requires it", async () => {
    await seedUser(prisma, { email: "required@test.local" })
    const role = await prisma.role.findFirstOrThrow({
      where: { users: { some: { email: "required@test.local" } } },
    })
    await prisma.role.update({
      where: { id: role.id },
      data: { requireTwoFactor: true },
    })
    const challenged = await http()
      .post("/api/v1/auth/login")
      .send({ email: "required@test.local", password: PASSWORD })
      .expect(201)
    const code = authenticator.generate(challenged.body.data.manualKey)
    const verified = await http()
      .post("/api/v1/auth/2fa/verify")
      .send({ challengeToken: challenged.body.data.challengeToken, code })
      .expect(201)
    const token = verified.body.data.accessToken as string

    const denied = await http()
      .post("/api/v1/account/two-factor/disable")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: PASSWORD })
      .expect(403)
    expect(denied.body.error.code).toBe("TWO_FACTOR_REQUIRED")

    // Reset is still allowed (forces re-setup, doesn't remove the requirement).
    await http()
      .post("/api/v1/account/two-factor/reset")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: PASSWORD })
      .expect(204)
  })

  it("/auth/me returns role and permissions", async () => {
    await seedUser(prisma, {
      email: "me@test.local",
      permissions: [{ resource: "users", action: "manage" }],
    })
    const { token } = await login("me@test.local")
    const me = await http()
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
    expect(me.body.data.permissions).toEqual([
      { resource: "users", action: "manage", scope: "all" },
    ])
  })

  it("rotates refresh tokens and revokes the family on reuse", async () => {
    await seedUser(prisma, { email: "r@test.local" })
    const { cookie } = await login("r@test.local")
    // Cookie is Secure; supertest still sends it when set explicitly.
    const first = await http()
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookie)
      .expect(200)
    expect(first.body.data.accessToken).toBeTruthy()

    const replay = await http()
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookie)
      .expect(401)
    expect(replay.body.error.code).toBe("REFRESH_TOKEN_REUSE_DETECTED")

    await http()
      .post("/api/v1/auth/refresh")
      .set("Cookie", first.headers["set-cookie"] as unknown as string[])
      .expect(401)
  })

  it("protects system roles and the last holder of roles.manage", async () => {
    const { role: sysRole } = await seedUser(prisma, {
      email: "sys@test.local",
      permissions: ALL_PERMISSIONS,
      isSystem: true,
    })
    const { token } = await login("sys@test.local")
    const auth = { Authorization: `Bearer ${token}` }

    const sys = await http()
      .put(`/api/v1/roles/${sysRole.id}/permissions`)
      .set(auth)
      .send({ permissions: [] })
      .expect(403)
    expect(sys.body.error.code).toBe("SYSTEM_ROLE_IMMUTABLE")
    await http().delete(`/api/v1/roles/${sysRole.id}`).set(auth).expect(403)

    const created = await http()
      .post("/api/v1/roles")
      .set(auth)
      .send({ name: "Editor" })
      .expect(201)
    await http()
      .put(`/api/v1/roles/${created.body.data.id}/permissions`)
      .set(auth)
      .send({
        permissions: [{ resource: "roles", action: "manage", scope: "all" }],
      })
      .expect(200)
    // Another holder (system role) exists, so revoking from Editor is fine.
    await http()
      .put(`/api/v1/roles/${created.body.data.id}/permissions`)
      .set(auth)
      .send({ permissions: [] })
      .expect(200)

    const audit = await prisma.auditLog.count({
      where: { entityId: created.body.data.id },
    })
    expect(audit).toBe(3)
  })

  it("wraps validation, not-found and 404-route errors in the envelope", async () => {
    await seedUser(prisma, {
      email: "e@test.local",
      permissions: ALL_PERMISSIONS,
    })
    const { token } = await login("e@test.local")
    const auth = { Authorization: `Bearer ${token}` }

    const invalid = await http()
      .post("/api/v1/roles")
      .set(auth)
      .send({})
      .expect(400)
    expect(invalid.body).toMatchObject({
      data: null,
      error: { code: "VALIDATION_ERROR" },
      status: { code: 400, type: "ERROR", messageInd: "Validasi gagal" },
    })
    expect(invalid.body.error.detail).toContain("name")

    const badUuid = await http()
      .get("/api/v1/roles/not-a-uuid")
      .set(auth)
      .expect(400)
    expect(badUuid.body.status.type).toBe("ERROR")

    const missing = await http()
      .get("/api/v1/roles/019a0000-0000-7000-8000-00000000ffff")
      .set(auth)
      .expect(404)
    expect(missing.body.error.code).toBe("ROLE_NOT_FOUND")

    const noRoute = await http().get("/api/v1/nope").set(auth).expect(404)
    expect(noRoute.body.status).toMatchObject({ code: 404, type: "ERROR" })
  })

  it("readiness reports dependencies and metrics are public", async () => {
    const res = await http().get("/api/v1/health/ready").expect(200)
    expect(res.body.data).toEqual({ status: "ok", database: "up", redis: "up" })
    const metrics = await http().get("/api/v1/metrics").expect(200)
    expect(metrics.text).toContain("nodejs_uptime_seconds")
  })

  it("sees permission changes immediately despite the cache", async () => {
    const { role } = await seedUser(prisma, {
      email: "c@test.local",
      permissions: [
        { resource: "roles", action: "manage" },
        { resource: "users", action: "manage" },
      ],
    })
    // A second holder so dropping users.manage is allowed.
    await seedUser(prisma, {
      email: "c2@test.local",
      permissions: ALL_PERMISSIONS,
    })
    const { token } = await login("c@test.local")
    const auth = { Authorization: `Bearer ${token}` }
    await http().get("/api/v1/users").set(auth).expect(200)

    await http()
      .put(`/api/v1/roles/${role.id}/permissions`)
      .set(auth)
      .send({
        permissions: [{ resource: "roles", action: "manage", scope: "all" }],
      })
      .expect(200)
    await http().get("/api/v1/users").set(auth).expect(403)
  })

  it("rejects an unknown resource/action pair", async () => {
    await seedUser(prisma, {
      email: "v@test.local",
      permissions: ALL_PERMISSIONS,
    })
    const { token } = await login("v@test.local")
    const created = await http()
      .post("/api/v1/roles")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "X" })
      .expect(201)
    await http()
      .put(`/api/v1/roles/${created.body.data.id}/permissions`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        permissions: [{ resource: "audit", action: "manage", scope: "all" }],
      })
      .expect(400)
  })

  it("blocks self-demotion and revokes sessions on deactivation", async () => {
    const { user: me } = await seedUser(prisma, {
      email: "self@test.local",
      permissions: ALL_PERMISSIONS,
    })
    const { user: other } = await seedUser(prisma, { email: "o@test.local" })
    const { token } = await login("self@test.local")
    const auth = { Authorization: `Bearer ${token}` }
    const otherSession = await login("o@test.local")

    await http()
      .patch(`/api/v1/users/${me.id}`)
      .set(auth)
      .send({ isActive: false })
      .expect(403)

    await http()
      .patch(`/api/v1/users/${other.id}`)
      .set(auth)
      .send({ isActive: false })
      .expect(200)
    await http()
      .post("/api/v1/auth/refresh")
      .set("Cookie", otherSession.cookie)
      .expect(401)
  })

  it("admin password reset revokes sessions and enables the new password", async () => {
    await seedUser(prisma, {
      email: "boss@test.local",
      permissions: ALL_PERMISSIONS,
    })
    const { user: target } = await seedUser(prisma, { email: "t@test.local" })
    const { token } = await login("boss@test.local")
    const targetSession = await login("t@test.local")

    const res = await http()
      .post(`/api/v1/users/${target.id}/reset-password`)
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "BrandNew123!" })
      .expect(204)
    expect(res.text).toBe("")

    await http()
      .post("/api/v1/auth/refresh")
      .set("Cookie", targetSession.cookie)
      .expect(401)
    await http()
      .post("/api/v1/auth/login")
      .send({ email: "t@test.local", password: "BrandNew123!" })
      .expect(201)
    expect(
      await prisma.auditLog.count({ where: { action: "user.reset_password" } })
    ).toBe(1)
  })

  it("echoes or generates x-request-id", async () => {
    const echoed = await http()
      .get("/api/v1/health")
      .set("x-request-id", "abc-123")
      .expect(200)
    expect(echoed.headers["x-request-id"]).toBe("abc-123")
    const generated = await http().get("/api/v1/health").expect(200)
    expect(generated.headers["x-request-id"]).toMatch(/^[\w-]{36}$/)
  })

  it("manages current user's FCM devices, notifications and push preferences", async () => {
    const { user } = await seedUser(prisma, { email: "notify@test.local" })
    const { token } = await login("notify@test.local")
    const auth = { Authorization: `Bearer ${token}` }

    await http()
      .post("/api/v1/notifications/devices")
      .set(auth)
      .send({ deviceId: "phone-1", token: "fcm-token", device: { os: "ios" } })
      .expect(204)
    expect(await prisma.fcmDevice.count({ where: { userId: user.id } })).toBe(1)

    await prisma.notification.create({
      data: {
        id: "notification-1",
        userId: user.id,
        type: "system",
        title: "Welcome",
        body: "Hello",
        data: { url: "/" },
        dedupeKey: "welcome-1",
      },
    })
    const list = await http().get("/api/v1/notifications").set(auth).expect(200)
    expect(list.body.data).toHaveLength(1)
    expect(list.body.meta.unreadCount).toBe(1)

    await http()
      .post("/api/v1/notifications/notification-1/read")
      .set(auth)
      .expect(201)
    const prefs = await http()
      .get("/api/v1/account/notifications/preferences")
      .set(auth)
      .expect(200)
    expect(prefs.body.data).toEqual({ pushEnabled: true })
    await http()
      .patch("/api/v1/account/notifications/preferences")
      .set(auth)
      .send({ pushEnabled: false })
      .expect(200)
    await http()
      .delete("/api/v1/notifications/devices/phone-1")
      .set(auth)
      .expect(204)
  })

  it("resets password through web link", async () => {
    await seedUser(prisma, { email: "reset-web@test.local" })
    await http()
      .post("/api/v1/auth/forgot-password")
      .send({ email: "reset-web@test.local", channel: "web" })
      .expect(204)
    expect(sentMail.at(-1)?.to).toBe("reset-web@test.local")
    const token = sentMail.at(-1)!.text.match(/token=([^\s]+)/)?.[1]
    expect(token).toBeTruthy()

    await http()
      .post("/api/v1/auth/reset-password")
      .send({ channel: "web", token, newPassword: "ResetWeb123!" })
      .expect(204)
    await http()
      .post("/api/v1/auth/login")
      .send({ email: "reset-web@test.local", password: "ResetWeb123!" })
      .expect(201)
  })

  it("resets password through mobile OTP", async () => {
    await seedUser(prisma, { email: "reset-mobile@test.local" })
    await http()
      .post("/api/v1/auth/forgot-password")
      .send({ email: "reset-mobile@test.local", channel: "mobile" })
      .expect(204)
    const otp = sentMail.at(-1)!.text.match(/\d{6}/)?.[0]
    expect(otp).toBeTruthy()

    await http()
      .post("/api/v1/auth/reset-password")
      .send({
        channel: "mobile",
        email: "reset-mobile@test.local",
        otp,
        newPassword: "ResetOtp123!",
      })
      .expect(204)
    await http()
      .post("/api/v1/auth/login")
      .send({ email: "reset-mobile@test.local", password: "ResetOtp123!" })
      .expect(201)
  })

  it("invites a user, accepts the invite and manages sessions", async () => {
    await seedUser(prisma, {
      email: "admin@test.local",
      permissions: ALL_PERMISSIONS,
    })
    const { token } = await login("admin@test.local")
    const role = await prisma.role.findFirstOrThrow()

    const created = await http()
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send({
        email: "invite@test.local",
        fullName: "Invitee",
        roleId: role.id,
      })
      .expect(201)
    expect(created.body.data.invited).toBe(true)
    const inviteToken = sentMail.at(-1)!.text.match(/token=([^\s]+)/)?.[1]
    expect(inviteToken).toBeTruthy()

    await http()
      .post("/api/v1/auth/accept-invite")
      .send({
        token: inviteToken,
        fullName: "Invited User",
        password: PASSWORD,
      })
      .expect(204)
    await http()
      .post("/api/v1/auth/login")
      .send({ email: "invite@test.local", password: PASSWORD })
      .expect(201)

    const auth = await login("invite@test.local")
    const sessions = await http()
      .get("/api/v1/account/sessions")
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(200)
    expect(
      sessions.body.data.some((s: { current: boolean }) => s.current)
    ).toBe(true)
    await http()
      .delete(`/api/v1/account/sessions/${sessions.body.data[0].id}`)
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(204)
  })

  it("uploads avatar and private attachment", async () => {
    await seedUser(prisma, { email: "files@test.local" })
    const { token } = await login("files@test.local")
    const auth = { Authorization: `Bearer ${token}` }

    const avatar = await http()
      .post("/api/v1/account/avatar")
      .set(auth)
      .attach("file", PNG, {
        filename: "avatar.png",
        contentType: "image/png",
      })
      .expect(201)
    expect(avatar.body.data.avatarUrl).toContain("avatars/public")

    const attachment = await http()
      .post("/api/v1/attachments")
      .set(auth)
      .attach("file", Buffer.from("document"), {
        filename: "doc.txt",
        contentType: "text/plain",
      })
      .expect(201)
    expect(attachment.body.data.filename).toBe("doc.txt")

    const list = await http().get("/api/v1/attachments").set(auth).expect(200)
    expect(list.body.data).toHaveLength(1)
  })

  it("soft-deletes, restores, exports and imports users", async () => {
    await seedUser(prisma, {
      email: "admin@test.local",
      permissions: ALL_PERMISSIONS,
    })
    const { user: target, role } = await seedUser(prisma, {
      email: "target@test.local",
    })
    const { token } = await login("admin@test.local")
    const auth = { Authorization: `Bearer ${token}` }

    await http().delete(`/api/v1/users/${target.id}`).set(auth).expect(200)
    const active = await http().get("/api/v1/users").set(auth).expect(200)
    expect(active.body.data.map((u: { id: string }) => u.id)).not.toContain(
      target.id
    )
    const deleted = await http()
      .get("/api/v1/users?deleted=true")
      .set(auth)
      .expect(200)
    expect(deleted.body.data[0].id).toBe(target.id)
    await http()
      .post("/api/v1/auth/login")
      .send({ email: "target@test.local", password: PASSWORD })
      .expect(401)
    await http()
      .post(`/api/v1/users/${target.id}/restore`)
      .set(auth)
      .expect(201)
    await login("target@test.local")

    const csv = await http()
      .get("/api/v1/users/export?format=csv")
      .set(auth)
      .expect(200)
    expect(csv.headers["content-type"]).toContain("text/csv")
    expect(csv.text).toContain("target@test.local")
    const xlsx = await http()
      .get("/api/v1/users/export?format=xlsx")
      .set(auth)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = []
        res.on("data", (c: Buffer) => chunks.push(c))
        res.on("end", () => cb(null, Buffer.concat(chunks)))
      })
      .expect(200)
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe("PK")

    const imported = await http()
      .post("/api/v1/users/import")
      .set(auth)
      .attach(
        "file",
        Buffer.from(
          `email,fullName,role\nnew@test.local,New User,${role.name}\ntarget@test.local,Dup,${role.name}\nbad,,nope\n`
        ),
        { filename: "users.csv", contentType: "text/csv" }
      )
      .expect(201)
    expect(imported.body.data.created).toBe(1)
    expect(
      imported.body.data.errors.map((e: { row: number }) => e.row)
    ).toEqual([3, 4])
    expect(sentMail.at(-1)?.to).toBe("new@test.local")
  })

  it("sorts, bulk-updates, previews imports and filters exports", async () => {
    await seedUser(prisma, {
      email: "admin@test.local",
      permissions: ALL_PERMISSIONS,
    })
    const { user: a, role } = await seedUser(prisma, { email: "a@test.local" })
    const { user: b } = await seedUser(prisma, { email: "b@test.local" })
    const { token } = await login("admin@test.local")
    const auth = { Authorization: `Bearer ${token}` }

    // Exact ordering is the database collation's business; assert that asc and
    // desc are consistent mirrors of each other.
    const sorted = await http()
      .get("/api/v1/users?sort=email&order=asc")
      .set(auth)
      .expect(200)
    const desc = await http()
      .get("/api/v1/users?sort=email&order=desc")
      .set(auth)
      .expect(200)
    const emails = (r: { body: { data: { email: string }[] } }) =>
      r.body.data.map((u) => u.email)
    expect(emails(sorted)).toHaveLength(3)
    expect(emails(desc)).toEqual([...emails(sorted)].reverse())

    const admin = sorted.body.data.find(
      (u: { email: string }) => u.email === "admin@test.local"
    )
    const bulk = await http()
      .post("/api/v1/users/bulk")
      .set(auth)
      .send({ ids: [a.id, b.id, admin.id], action: "deactivate" })
      .expect(200)
    expect(bulk.body.data.succeeded.sort()).toEqual([a.id, b.id].sort())
    expect(bulk.body.data.failed).toEqual([
      expect.objectContaining({ id: admin.id, code: "CANNOT_MODIFY_SELF" }),
    ])

    const csv = await http()
      .get("/api/v1/users/export?format=csv&isActive=false")
      .set(auth)
      .expect(200)
    expect(csv.text).toContain("a@test.local")
    expect(csv.text).not.toContain("admin@test.local")

    const template = await http()
      .get("/api/v1/users/import-template")
      .set(auth)
      .expect(200)
    expect(template.text).toContain("email,fullName,role")

    const preview = await http()
      .post("/api/v1/users/import/preview")
      .set(auth)
      .attach(
        "file",
        Buffer.from(
          `email,fullName,role\nnew@test.local,New,${role.name}\nnew@test.local,Dup,${role.name}\nx@test.local,X,ghost\n`
        ),
        { filename: "u.csv", contentType: "text/csv" }
      )
      .expect(200)
    expect(
      preview.body.data.map((r: { errors: string[] }) => r.errors)
    ).toEqual([[], ["email already exists"], ['unknown role "ghost"']])
    expect(
      await prisma.user.count({ where: { email: "new@test.local" } })
    ).toBe(0)
  })

  it("filters and exports the audit log; reports system status", async () => {
    await seedUser(prisma, {
      email: "admin@test.local",
      permissions: ALL_PERMISSIONS,
    })
    const { user: target } = await seedUser(prisma, { email: "t@test.local" })
    const { token } = await login("admin@test.local")
    const auth = { Authorization: `Bearer ${token}` }
    await http()
      .patch(`/api/v1/users/${target.id}`)
      .set(auth)
      .send({ fullName: "Renamed" })
      .expect(200)
    await http()
      .put("/api/v1/settings")
      .set(auth)
      .send({ appName: "Acme", supportEmail: null })
      .expect(200)

    const today = new Date().toISOString().slice(0, 10)
    const filtered = await http()
      .get(`/api/v1/audit?action=user.upd&from=${today}&to=${today}`)
      .set(auth)
      .expect(200)
    expect(filtered.body.data.map((e: { action: string }) => e.action)).toEqual(
      ["user.update"]
    )
    const past = await http()
      .get("/api/v1/audit?to=2000-01-01")
      .set(auth)
      .expect(200)
    expect(past.body.data).toHaveLength(0)

    const csv = await http()
      .get("/api/v1/audit/export?entityType=settings")
      .set(auth)
      .expect(200)
    expect(csv.text).toContain("settings.update")
    expect(csv.text).not.toContain("user.update")

    const status = await http()
      .get("/api/v1/system/status")
      .set(auth)
      .expect(200)
    expect(status.body.data.checks.database.status).toBe("up")
    expect(status.body.data.integrations).toMatchObject({ storage: true })

    const plain = await login("t@test.local").catch(() => null)
    expect(plain).toBeTruthy()
    await http()
      .get("/api/v1/system/status")
      .set("Authorization", `Bearer ${plain!.token}`)
      .expect(403)
  })

  it("manages announcements: drafts stay hidden, publishing notifies once", async () => {
    await seedUser(prisma, {
      email: "admin@test.local",
      permissions: ALL_PERMISSIONS,
    })
    const { user: reader } = await seedUser(prisma, {
      email: "reader@test.local",
      permissions: [{ resource: "announcements", action: "view" }],
    })
    const admin = await login("admin@test.local")
    const asAdmin = { Authorization: `Bearer ${admin.token}` }
    const asReader = {
      Authorization: `Bearer ${(await login("reader@test.local")).token}`,
    }

    const draft = await http()
      .post("/api/v1/announcements")
      .set(asAdmin)
      .send({ title: "Draft", content: "Not yet", status: "draft" })
      .expect(201)
    const id = draft.body.data.id as string
    expect(draft.body.data).toMatchObject({
      status: "draft",
      publishedAt: null,
      authorName: "admin@test.local",
    })

    const visible = await http()
      .get("/api/v1/announcements")
      .set(asReader)
      .expect(200)
    expect(visible.body.data).toHaveLength(0)
    await http().get(`/api/v1/announcements/${id}`).set(asReader).expect(404)
    await http().get("/api/v1/announcements/manage").set(asReader).expect(403)
    await http()
      .post("/api/v1/announcements")
      .set(asReader)
      .send({ title: "x", content: "y" })
      .expect(403)

    const published = await http()
      .patch(`/api/v1/announcements/${id}`)
      .set(asAdmin)
      .send({ status: "published", isPinned: true })
      .expect(200)
    expect(published.body.data.publishedAt).toBeTruthy()
    expect(published.body.data.title).toBe("Draft")
    await http()
      .patch(`/api/v1/announcements/${id}`)
      .set(asAdmin)
      .send({ title: "Live" })
      .expect(200)
    const readerNotifications = await prisma.notification.findMany({
      where: { userId: reader.id, type: "announcement" },
    })
    expect(readerNotifications).toHaveLength(1)

    const list = await http()
      .get("/api/v1/announcements?search=live")
      .set(asReader)
      .expect(200)
    expect(list.body.data.map((a: { title: string }) => a.title)).toEqual([
      "Live",
    ])

    const image = await http()
      .post("/api/v1/announcements/image")
      .set(asAdmin)
      .attach("image", PNG, { filename: "a.png", contentType: "image/png" })
      .expect(201)
    expect(image.body.data.url).toContain("announcements/public")
    await http()
      .post("/api/v1/announcements/image")
      .set(asAdmin)
      .attach("image", Buffer.from("<svg/>"), {
        filename: "a.png",
        contentType: "image/png",
      })
      .expect(400)

    await http().delete(`/api/v1/announcements/${id}`).set(asAdmin).expect(204)
    await http()
      .get(`/api/v1/announcements/manage/${id}`)
      .set(asAdmin)
      .expect(404)
  })

  it("signs out other sessions, deletes own attachments, lists user activity", async () => {
    await seedUser(prisma, {
      email: "admin@test.local",
      permissions: ALL_PERMISSIONS,
    })
    const { user: me } = await seedUser(prisma, { email: "me@test.local" })
    const { user: other } = await seedUser(prisma, {
      email: "other@test.local",
    })
    const first = await login("me@test.local")
    await login("me@test.local")
    const current = await login("me@test.local")
    const auth = { Authorization: `Bearer ${current.token}` }

    await http().delete("/api/v1/account/sessions").set(auth).expect(204)
    const sessions = await http()
      .get("/api/v1/account/sessions")
      .set(auth)
      .expect(200)
    expect(sessions.body.data).toHaveLength(1)
    expect(sessions.body.data[0].current).toBe(true)
    await http()
      .post("/api/v1/auth/refresh")
      .set("Cookie", first.cookie)
      .expect(401)

    const file = await http()
      .post("/api/v1/attachments")
      .set(auth)
      .attach("file", Buffer.from("doc"), {
        filename: "a.txt",
        contentType: "text/plain",
      })
      .expect(201)
    const fileId = file.body.data.id as string
    const otherAuth = {
      Authorization: `Bearer ${(await login("other@test.local")).token}`,
    }
    await http()
      .delete(`/api/v1/attachments/${fileId}`)
      .set(otherAuth)
      .expect(404)
    await http().delete(`/api/v1/attachments/${fileId}`).set(auth).expect(204)
    await http().get("/api/v1/attachments").set(auth).expect(200)
    expect(await prisma.attachment.count()).toBe(0)

    const admin = {
      Authorization: `Bearer ${(await login("admin@test.local")).token}`,
    }
    await http()
      .patch(`/api/v1/users/${me.id}`)
      .set(admin)
      .send({ fullName: "Changed by admin" })
      .expect(200)
    await http()
      .patch(`/api/v1/users/${other.id}`)
      .set(admin)
      .send({ fullName: "Unrelated" })
      .expect(200)
    const activity = await http()
      .get(`/api/v1/audit?userId=${me.id}`)
      .set(admin)
      .expect(200)
    const actions = activity.body.data.map((e: { action: string }) => e.action)
    expect(actions).toContain("user.update")
    expect(actions).toContain("account.sessions.revoke_others")
    expect(
      activity.body.data.every(
        (e: { actorUserId: string; entityId: string }) =>
          e.actorUserId === me.id || e.entityId === me.id
      )
    ).toBe(true)
  })

  it("pushes only to users with push enabled, and never when globally off", async () => {
    await seedUser(prisma, {
      email: "admin@test.local",
      permissions: ALL_PERMISSIONS,
    })
    const { user: on } = await seedUser(prisma, { email: "on@test.local" })
    const { user: off } = await seedUser(prisma, { email: "off@test.local" })
    for (const [userId, token] of [
      [on.id, "token-on"],
      [off.id, "token-off"],
    ] as const) {
      await prisma.fcmDevice.create({
        data: { id: generateId(), userId, deviceId: token, token },
      })
    }
    await prisma.user.update({
      where: { id: off.id },
      data: { notificationPushEnabled: false },
    })
    const { token } = await login("admin@test.local")
    const auth = { Authorization: `Bearer ${token}` }

    await http()
      .post("/api/v1/announcements")
      .set(auth)
      .send({ title: "One", content: "first" })
      .expect(201)
    expect(sentPush.flat()).toEqual(["token-on"])
    expect(await prisma.notification.count({ where: { userId: off.id } })).toBe(
      1
    )

    await http()
      .put("/api/v1/settings")
      .set(auth)
      .send({
        appName: "Acme",
        supportEmail: null,
        pushNotificationsEnabled: false,
      })
      .expect(200)
    await http()
      .post("/api/v1/announcements")
      .set(auth)
      .send({ title: "Two", content: "second" })
      .expect(201)
    expect(sentPush.flat()).toEqual(["token-on"])
    expect(await prisma.notification.count({ where: { userId: on.id } })).toBe(
      2
    )
  })

  it("receives Midtrans webhooks idempotently and rejects bad signatures", async () => {
    const payload = {
      order_id: "ORDER-1",
      status_code: "200",
      gross_amount: "10000.00",
      signature_key: "a".repeat(128),
      transaction_status: "settlement",
      transaction_id: "trx-1",
    }
    const first = await http()
      .post("/api/v1/webhooks/midtrans")
      .send(payload)
      .expect(200)
    expect(first.body.data).toEqual({ duplicate: false })
    const duplicate = await http()
      .post("/api/v1/webhooks/midtrans")
      .send(payload)
      .expect(200)
    expect(duplicate.body.data).toEqual({ duplicate: true })
    expect(await prisma.webhookEvent.count()).toBe(1)
    expect(await prisma.webhookEvent.findFirstOrThrow()).toMatchObject({
      provider: "midtrans",
      eventType: "settlement",
      status: "processed",
    })

    // A delivery that failed processing must be retried, not swallowed.
    await prisma.webhookEvent.updateMany({
      data: { status: "failed", error: "boom", processedAt: null },
    })
    const retried = await http()
      .post("/api/v1/webhooks/midtrans")
      .send(payload)
      .expect(200)
    expect(retried.body.data).toEqual({ duplicate: false })
    expect(await prisma.webhookEvent.findFirstOrThrow()).toMatchObject({
      status: "processed",
      error: null,
    })

    await http()
      .post("/api/v1/webhooks/midtrans")
      .send({ ...payload, signature_key: "b".repeat(128) })
      .expect(401)
    await http()
      .post("/api/v1/webhooks/midtrans")
      .send({ ...payload, signature_key: "short" })
      .expect(400)
  })

  it("lists and replays failed webhook events", async () => {
    await seedUser(prisma, {
      email: "webhook-admin@test.local",
      permissions: ALL_PERMISSIONS,
    })
    const { token } = await login("webhook-admin@test.local")
    const auth = { Authorization: `Bearer ${token}` }
    const id = generateId()
    await prisma.webhookEvent.create({
      data: {
        id,
        provider: "midtrans",
        eventKey: "ORDER-2:trx-2:settlement:200:10000.00",
        eventType: "settlement",
        status: "failed",
        error: "boom",
        payload: {
          order_id: "ORDER-2",
          status_code: "200",
          gross_amount: "10000.00",
          signature_key: "a".repeat(128),
          transaction_status: "settlement",
          transaction_id: "trx-2",
        },
      },
    })
    const list = await http()
      .get("/api/v1/webhooks/events?status=failed")
      .set(auth)
      .expect(200)
    expect(list.body.data[0]).toMatchObject({ id, status: "failed" })
    const replayed = await http()
      .post(`/api/v1/webhooks/events/${id}/replay`)
      .set(auth)
      .expect(200)
    expect(replayed.body.data).toEqual({ duplicate: false })
    expect(
      await prisma.webhookEvent.findUniqueOrThrow({ where: { id } })
    ).toMatchObject({
      status: "processed",
      error: null,
    })
  })

  it("manages API keys without returning secret after create", async () => {
    await seedUser(prisma, {
      email: "keys-admin@test.local",
      permissions: ALL_PERMISSIONS,
    })
    const { token } = await login("keys-admin@test.local")
    const auth = { Authorization: `Bearer ${token}` }
    const created = await http()
      .post("/api/v1/api-keys")
      .set(auth)
      .send({ name: "Zapier" })
      .expect(201)
    expect(created.body.data.key).toMatch(/^rk_/)
    expect(created.body.data.prefix).toBe(created.body.data.key.slice(0, 10))
    const listed = await http().get("/api/v1/api-keys").set(auth).expect(200)
    expect(listed.body.data[0]).not.toHaveProperty("key")
    await http()
      .patch(`/api/v1/api-keys/${created.body.data.id}`)
      .set(auth)
      .send({ isActive: false })
      .expect(200)
    await http()
      .delete(`/api/v1/api-keys/${created.body.data.id}`)
      .set(auth)
      .expect(204)
  })

  it("runs maintenance cleanup using settings retention", async () => {
    await seedUser(prisma, {
      email: "admin@test.local",
      permissions: ALL_PERMISSIONS,
    })
    const { user } = await seedUser(prisma, { email: "cleanup@test.local" })
    const { token } = await login("admin@test.local")
    const auth = { Authorization: `Bearer ${token}` }
    const old = new Date("2000-01-01T00:00:00.000Z")
    await prisma.appSetting.upsert({
      where: { id: "app" },
      create: { id: "app", value: { maintenanceRetentionDays: 7 } },
      update: { value: { maintenanceRetentionDays: 7 } },
    })
    await prisma.userToken.create({
      data: {
        id: generateId(),
        userId: user.id,
        purpose: "password_reset",
        channel: "web",
        tokenHash: `old-${generateId()}`,
        expiresAt: old,
      },
    })
    const family = await prisma.refreshTokenFamily.create({
      data: { id: generateId(), userId: user.id },
    })
    await prisma.refreshToken.create({
      data: {
        id: generateId(),
        familyId: family.id,
        tokenHash: `old-${generateId()}`,
        expiresAt: old,
      },
    })
    await prisma.webhookEvent.create({
      data: {
        id: generateId(),
        provider: "midtrans",
        eventKey: `old-${generateId()}`,
        eventType: "settlement",
        status: "processed",
        payload: {},
        receivedAt: old,
      },
    })
    await prisma.notification.create({
      data: {
        id: generateId(),
        userId: user.id,
        type: "system",
        title: "Old",
        body: "Old",
        data: {},
        readAt: old,
        createdAt: old,
        dedupeKey: `old-${generateId()}`,
      },
    })
    const result = await http()
      .post("/api/v1/system/maintenance/cleanup")
      .set(auth)
      .expect(201)
    expect(result.body.data.deleted).toMatchObject({
      userTokens: 1,
      refreshTokens: 1,
      webhookEvents: 1,
      notifications: 1,
    })
  })

  it("serves public settings and uploads a logo", async () => {
    await seedUser(prisma, {
      email: "admin@test.local",
      permissions: ALL_PERMISSIONS,
    })
    const { token } = await login("admin@test.local")
    const auth = { Authorization: `Bearer ${token}` }
    const publicInitial = await http()
      .get("/api/v1/settings/public")
      .expect(200)
    expect(publicInitial.body.data).toEqual({
      appName: "Rekanara",
      tagline: null,
      logoUrl: null,
      bannerUrl: null,
      supportEmail: null,
      loginNotice: null,
    })
    const logo = await http()
      .post("/api/v1/settings/image")
      .set(auth)
      .attach("image", PNG, { filename: "logo.png", contentType: "image/png" })
      .expect(201)
    expect(logo.body.data.url).toContain("branding/public")
    await http()
      .put("/api/v1/settings")
      .set(auth)
      .send({
        appName: "Acme",
        supportEmail: null,
        logoUrl: logo.body.data.url,
        loginNotice: "Welcome",
        emailFooter: "Footer",
        timezone: "Asia/Jakarta",
        maintenanceRetentionDays: 30,
        pushNotificationsEnabled: false,
      })
      .expect(200)
    const publicUpdated = await http()
      .get("/api/v1/settings/public")
      .expect(200)
    expect(publicUpdated.body.data).toEqual({
      appName: "Acme",
      tagline: null,
      logoUrl: logo.body.data.url,
      bannerUrl: null,
      supportEmail: null,
      loginNotice: "Welcome",
    })
  })

  it("reads and updates app settings", async () => {
    await seedUser(prisma, {
      email: "admin@test.local",
      permissions: ALL_PERMISSIONS,
    })
    const { token } = await login("admin@test.local")
    const auth = { Authorization: `Bearer ${token}` }
    const initial = await http().get("/api/v1/settings").set(auth).expect(200)
    expect(initial.body.data.appName).toBe("Rekanara")
    await http()
      .put("/api/v1/settings")
      .set(auth)
      .send({ appName: "Acme", supportEmail: "help@acme.test" })
      .expect(200)
    const updated = await http().get("/api/v1/settings").set(auth).expect(200)
    expect(updated.body.data).toEqual({
      appName: "Acme",
      tagline: null,
      description: null,
      supportEmail: "help@acme.test",
      supportPhone: null,
      logoUrl: null,
      bannerUrl: null,
      loginNotice: null,
      emailFooter: null,
      timezone: "Asia/Jakarta",
      currency: "IDR",
      address: null,
      district: null,
      city: null,
      province: null,
      country: null,
      postalCode: null,
      latitude: null,
      longitude: null,
      maintenanceRetentionDays: 90,
      pushNotificationsEnabled: true,
    })
  })

  it("stores profile, location and currency settings and rejects bad coordinates", async () => {
    await seedUser(prisma, {
      email: "admin@test.local",
      permissions: ALL_PERMISSIONS,
    })
    const { token } = await login("admin@test.local")
    const auth = { Authorization: `Bearer ${token}` }
    await http()
      .put("/api/v1/settings")
      .set(auth)
      .send({ latitude: 91 })
      .expect(400)
    await http()
      .put("/api/v1/settings")
      .set(auth)
      .send({ currency: "RUPIAH" })
      .expect(400)
    await http()
      .put("/api/v1/settings")
      .set(auth)
      .send({
        tagline: "Built to ship",
        description: "A starter",
        supportPhone: "+62 812 0000",
        address: "Jl. Sudirman 1",
        district: "Tanah Abang",
        city: "Jakarta",
        province: "DKI Jakarta",
        country: "Indonesia",
        postalCode: "10220",
        latitude: -6.2,
        longitude: 106.8166,
        currency: "usd",
      })
      .expect(200)
    const saved = await http().get("/api/v1/settings").set(auth).expect(200)
    expect(saved.body.data).toMatchObject({
      tagline: "Built to ship",
      city: "Jakarta",
      postalCode: "10220",
      latitude: -6.2,
      longitude: 106.8166,
      currency: "USD",
    })
    const pub = await http().get("/api/v1/settings/public").expect(200)
    expect(pub.body.data.tagline).toBe("Built to ship")
    expect(pub.body.data).not.toHaveProperty("address")
  })

  it("verifies current user's email through a link", async () => {
    const { user } = await seedUser(prisma, { email: "verify@test.local" })
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: null },
    })
    const auth = await login("verify@test.local")
    await http()
      .post("/api/v1/account/verify-email")
      .set("Authorization", `Bearer ${auth.token}`)
      .expect(204)
    const token = sentMail.at(-1)!.text.match(/token=([^\s]+)/)?.[1]
    expect(token).toBeTruthy()
    await http().post("/api/v1/auth/verify-email").send({ token }).expect(204)
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    ).resolves.toMatchObject({ emailVerifiedAt: expect.any(Date) })
  })

  // Keep last: it exhausts this IP's login window.
  it("throttles login attempts separately from the global limit", async () => {
    process.env.LOGIN_THROTTLE_LIMIT = "2"
    try {
      const attempt = () =>
        http()
          .post("/api/v1/auth/login")
          .set("X-Forwarded-For", "10.0.0.9")
          .send({ email: "x@test.local", password: "wrong-password" })
      // Earlier specs already used this IP's window; just require a 429 soon.
      const statuses: number[] = []
      for (let i = 0; i < 4; i++) statuses.push((await attempt()).status)
      expect(statuses).toContain(429)
      const res = await attempt()
      expect(res.body.status).toMatchObject({ code: 429, type: "ERROR" })
    } finally {
      process.env.LOGIN_THROTTLE_LIMIT = "100000"
    }
  })
})
