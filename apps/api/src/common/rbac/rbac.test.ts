import { describe, expect, it, vi } from "vitest"
import { PermissionGuard } from "./permission-guard"
import { ScopeResolver } from "./scope-resolver"
import { buildRedisUrl } from "../config/env.schema"

const ctx = (user: unknown) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  }) as never

describe("PermissionGuard", () => {
  it("fails closed when a route declares no permission", async () => {
    const guard = new PermissionGuard(
      { getAllAndOverride: () => undefined } as never,
      { resolve: vi.fn() } as never
    )
    await expect(guard.canActivate(ctx({ id: "u" }))).rejects.toMatchObject({
      response: { code: "PERMISSION_NOT_DECLARED" },
    })
  })
})

describe("ScopeResolver", () => {
  const rows = (scope: string) => ({
    findByRoleId: async () => [{ resource: "users", action: "manage", scope }],
  })
  const user = { id: "u1", roleId: "r1" }

  it("denies a permission the role lacks", async () => {
    const r = new ScopeResolver({ findByRoleId: async () => [] } as never)
    await expect(r.resolve(user, "users.manage")).rejects.toMatchObject({
      code: "PERMISSION_NOT_GRANTED",
    })
  })

  it("resolves self and all scopes", async () => {
    expect(
      await new ScopeResolver(rows("all") as never).resolve(
        user,
        "users.manage"
      )
    ).toEqual({ kind: "all" })
    expect(
      await new ScopeResolver(rows("self") as never).resolve(
        user,
        "users.manage"
      )
    ).toEqual({ kind: "self", userId: "u1" })
  })

  it("denies team scope without a hierarchy provider instead of widening", async () => {
    await expect(
      new ScopeResolver(rows("team") as never).resolve(user, "users.manage")
    ).rejects.toMatchObject({ code: "TEAM_SCOPE_UNAVAILABLE" })
  })
})

describe("buildRedisUrl", () => {
  it("encodes the password", () => {
    expect(
      buildRedisUrl({
        REDIS_HOST: "h",
        REDIS_PORT: 1,
        REDIS_PASSWORD: "p@ss",
        REDIS_DB: 2,
      })
    ).toBe("redis://:p%40ss@h:1/2")
  })
})
