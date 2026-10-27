import { Inject, Injectable } from "@nestjs/common"
import {
  CreateUserRequestSchema,
  type BulkUserAction,
  type BulkUserActionResult,
  type UserExportQuery,
  type UserImportPreviewRow,
  type UserImportResult,
} from "@workspace/contracts"
import { DomainException } from "../../../common/errors/domain-exception"
import type {
  CreateUserRequest,
  UpdateUserRequest,
  UserListQuery,
  UserResponse,
} from "@workspace/contracts"
import { generateId } from "../../../common/ids/id-generator"
import { CsvParseError, parseCsv, toCsv } from "../../../common/csv"
import { toXlsx } from "../../../common/xlsx"
import { Paged } from "../../../common/http/response-envelope.interceptor"
import { isUniqueConstraintViolation } from "../../../common/errors/prisma-error.util"
import {
  PASSWORD_HASHER,
  type PasswordHasherPort,
} from "../../auth/domain/ports/password-hasher.port"
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepositoryPort,
} from "../../auth/domain/ports/refresh-token-repository.port"
import {
  USERS_REPOSITORY,
  type UserRepositoryPort,
} from "../domain/user-repository.port"
import { InviteUseCase } from "../../auth/application/use-cases/invite.use-case"
import {
  CannotModifySelfError,
  EmailTakenError,
  InvalidImportFileError,
  InvalidRoleError,
  UserAlreadyActiveError,
  UserDeletedError,
  UserNotDeletedError,
  UserNotFoundError,
} from "../domain/users.errors"

@Injectable()
export class UsersService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepositoryPort,
    private readonly invite: InviteUseCase
  ) {}

  async list(query: UserListQuery) {
    const { data, total } = await this.users.findPage(query)
    return Paged.of(data, total, query.page, query.limit)
  }

  async get(id: string): Promise<UserResponse> {
    const user = await this.users.findById(id)
    if (!user) throw new UserNotFoundError()
    return user
  }

  async create(input: CreateUserRequest): Promise<UserResponse> {
    if (!(await this.users.roleExists(input.roleId)))
      throw new InvalidRoleError()
    let created: UserResponse
    try {
      created = await this.users.create({
        id: generateId(),
        email: input.email.trim().toLowerCase(),
        fullName: input.fullName,
        roleId: input.roleId,
        // No password means an invite: the user sets their own via the emailed link.
        passwordHash: input.password
          ? await this.hasher.hash(input.password)
          : null,
      })
    } catch (err) {
      if (isUniqueConstraintViolation(err, "email")) throw new EmailTakenError()
      throw err
    }
    if (!input.password) await this.invite.sendInvite(created.id, created.email)
    return created
  }

  async resendInvite(id: string): Promise<void> {
    const user = await this.get(id)
    if (user.deletedAt) throw new UserDeletedError()
    if (!user.invited) throw new UserAlreadyActiveError()
    await this.invite.sendInvite(user.id, user.email)
  }

  async update(
    actorId: string,
    id: string,
    patch: UpdateUserRequest
  ): Promise<UserResponse> {
    const user = await this.get(id)
    if (user.deletedAt) throw new UserDeletedError()
    if (
      actorId === id &&
      ((patch.roleId && patch.roleId !== user.roleId) ||
        patch.isActive === false)
    ) {
      throw new CannotModifySelfError()
    }
    if (patch.roleId && !(await this.users.roleExists(patch.roleId))) {
      throw new InvalidRoleError()
    }
    const updated = await this.users.update(id, patch)
    // Role change or deactivation must end existing sessions.
    if (
      (patch.roleId && patch.roleId !== user.roleId) ||
      patch.isActive === false
    ) {
      await this.refreshTokens.revokeAllForUser(id)
    }
    return updated
  }

  async resetPassword(id: string, password: string): Promise<void> {
    await this.get(id)
    await this.users.setPasswordHash(id, await this.hasher.hash(password))
    await this.refreshTokens.revokeAllForUser(id)
  }

  async remove(actorId: string, id: string): Promise<UserResponse> {
    const user = await this.get(id)
    if (actorId === id) throw new CannotModifySelfError()
    if (user.deletedAt) return user
    const deleted = await this.users.setDeleted(id, new Date())
    await this.refreshTokens.revokeAllForUser(id)
    return deleted
  }

  async restore(id: string): Promise<UserResponse> {
    const user = await this.get(id)
    if (!user.deletedAt) throw new UserNotDeletedError()
    return this.users.setDeleted(id, null)
  }

  async bulk(
    actorId: string,
    { ids, action }: BulkUserAction
  ): Promise<BulkUserActionResult> {
    const result: BulkUserActionResult = { succeeded: [], failed: [] }
    for (const id of new Set(ids)) {
      try {
        if (action === "delete") await this.remove(actorId, id)
        else if (action === "restore") await this.restore(id)
        else await this.update(actorId, id, { isActive: action === "activate" })
        result.succeeded.push(id)
      } catch (err) {
        if (!(err instanceof DomainException)) throw err
        result.failed.push({ id, code: err.code, message: err.title })
      }
    }
    return result
  }

  importTemplate() {
    return Buffer.from(
      toCsv([
        ["email", "fullName", "role"],
        ["jane@example.com", "Jane Doe", "Admin"],
      ])
    )
  }

  async export({ format, ...filter }: UserExportQuery) {
    const header = [
      "email",
      "fullName",
      "role",
      "status",
      "emailVerifiedAt",
      "lastLoginAt",
      "createdAt",
    ]
    const rows = (await this.users.findForExport(filter)).map((u) => [
      u.email,
      u.fullName,
      u.roleName,
      u.invited ? "invited" : u.isActive ? "active" : "inactive",
      u.emailVerifiedAt,
      u.lastLoginAt,
      u.createdAt,
    ])
    const stamp = new Date().toISOString().slice(0, 10)
    return format === "xlsx"
      ? {
          filename: `users-${stamp}.xlsx`,
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          body: toXlsx([header, ...rows], "Users"),
        }
      : {
          filename: `users-${stamp}.csv`,
          contentType: "text/csv; charset=utf-8",
          body: Buffer.from(toCsv([header, ...rows])),
        }
  }

  /** Validates the CSV without writing anything. */
  async previewImport(buffer?: Buffer): Promise<UserImportPreviewRow[]> {
    return (await this.validateImport(buffer)).map(
      ({ input: _input, ...row }) => row
    )
  }

  /** CSV columns: email, fullName, role (role name). Every valid row is invited by email. */
  async import(buffer?: Buffer): Promise<UserImportResult> {
    const rows = await this.validateImport(buffer)
    const result: UserImportResult = { created: 0, errors: [] }
    for (const row of rows) {
      if (row.errors.length > 0 || !row.input) {
        result.errors.push({ row: row.row, message: row.errors.join("; ") })
        continue
      }
      await this.create(row.input)
      result.created++
    }
    return result
  }

  private async validateImport(buffer?: Buffer) {
    if (!buffer?.length) throw new InvalidImportFileError("file is empty")
    let table: string[][]
    try {
      table = parseCsv(buffer.toString("utf8"))
    } catch (err) {
      if (err instanceof CsvParseError)
        throw new InvalidImportFileError(err.message)
      throw err
    }
    const [head, ...body] = table
    const cols = (head ?? []).map((h) => h.trim().toLowerCase())
    const at = (name: string) => cols.indexOf(name.toLowerCase())
    if (at("email") < 0 || at("fullName") < 0 || at("role") < 0)
      throw new InvalidImportFileError("header must have email,fullName,role")
    if (body.length > IMPORT_LIMIT)
      throw new InvalidImportFileError(`max ${IMPORT_LIMIT} rows`)

    const cell = (r: string[], name: string) => (r[at(name)] ?? "").trim()
    const roles = await this.users.roleIdsByName()
    const taken = await this.users.existingEmails(
      body.map((r) => cell(r, "email").toLowerCase())
    )
    return body.map((r, i) => {
      const email = cell(r, "email").toLowerCase()
      const fullName = cell(r, "fullName")
      const role = cell(r, "role")
      const parsed = CreateUserRequestSchema.safeParse({
        email,
        fullName,
        roleId: roles.get(role.toLowerCase()),
      })
      const errors = parsed.success
        ? []
        : parsed.error.issues.map((x) =>
            x.path[0] === "roleId"
              ? `unknown role "${role}"`
              : `${x.path.join(".")}: ${x.message}`
          )
      if (parsed.success && taken.has(email))
        errors.push("email already exists")
      if (errors.length === 0) taken.add(email)
      return {
        row: i + 2,
        email,
        fullName,
        role,
        errors,
        input: errors.length === 0 && parsed.success ? parsed.data : null,
      }
    })
  }
}

const IMPORT_LIMIT = 1000
