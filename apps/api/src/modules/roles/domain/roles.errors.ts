import { DomainException } from "../../../common/errors/domain-exception"

export class RoleNotFoundError extends DomainException {
  constructor() {
    super({ code: "ROLE_NOT_FOUND", title: "Role not found", status: 404 })
  }
}

export class RoleNameTakenError extends DomainException {
  constructor() {
    super({
      code: "ROLE_NAME_TAKEN",
      title: "Role name already exists",
      status: 409,
    })
  }
}

export class SystemRoleImmutableError extends DomainException {
  constructor() {
    super({
      code: "SYSTEM_ROLE_IMMUTABLE",
      title:
        "System roles cannot be renamed, deleted or have permissions changed",
      status: 403,
    })
  }
}

export class RoleInUseError extends DomainException {
  constructor() {
    super({
      code: "ROLE_IN_USE",
      title: "Role still has users assigned",
      status: 409,
    })
  }
}

export class LastPermissionHolderError extends DomainException {
  constructor(permission: string) {
    super({
      code: "LAST_PERMISSION_HOLDER",
      title: `No role would be left holding ${permission}`,
      status: 409,
    })
  }
}
