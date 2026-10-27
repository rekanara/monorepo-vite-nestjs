import { DomainException } from "../../../common/errors/domain-exception"

export class UserNotFoundError extends DomainException {
  constructor() {
    super({ code: "USER_NOT_FOUND", title: "User not found", status: 404 })
  }
}

export class EmailTakenError extends DomainException {
  constructor() {
    super({ code: "EMAIL_TAKEN", title: "Email already in use", status: 409 })
  }
}

export class CannotModifySelfError extends DomainException {
  constructor() {
    super({
      code: "CANNOT_MODIFY_SELF",
      title: "You cannot change your own role or deactivate yourself",
      status: 403,
    })
  }
}

export class InvalidRoleError extends DomainException {
  constructor() {
    super({ code: "INVALID_ROLE", title: "Role does not exist", status: 400 })
  }
}

export class UserAlreadyActiveError extends DomainException {
  constructor() {
    super({
      code: "USER_ALREADY_ACTIVE",
      title: "User has already accepted the invite",
      status: 409,
    })
  }
}

export class UserDeletedError extends DomainException {
  constructor() {
    super({
      code: "USER_DELETED",
      title: "User is deleted; restore it first",
      status: 409,
    })
  }
}

export class UserNotDeletedError extends DomainException {
  constructor() {
    super({
      code: "USER_NOT_DELETED",
      title: "User is not deleted",
      status: 409,
    })
  }
}

export class InvalidImportFileError extends DomainException {
  constructor(detail: string) {
    super({
      code: "INVALID_IMPORT_FILE",
      title: `Import file is invalid: ${detail}`,
      status: 400,
    })
  }
}
