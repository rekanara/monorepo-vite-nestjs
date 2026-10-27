import { DomainException } from "../../../../common/errors/domain-exception"

export class InvalidCredentialsError extends DomainException {
  constructor() {
    super({
      code: "INVALID_CREDENTIALS",
      title: "Email or password is incorrect",
      status: 401,
    })
  }
}

export class InvalidRefreshTokenError extends DomainException {
  constructor() {
    super({
      code: "INVALID_REFRESH_TOKEN",
      title: "Refresh token is invalid or expired",
      status: 401,
    })
  }
}

export class TokenReuseDetectedError extends DomainException {
  constructor() {
    super({
      code: "REFRESH_TOKEN_REUSE_DETECTED",
      title: "Refresh token reuse detected; session revoked",
      status: 401,
    })
  }
}

export class SessionUserNotFoundError extends DomainException {
  constructor() {
    super({
      code: "SESSION_USER_NOT_FOUND",
      title: "The signed-in user no longer exists or is inactive",
      status: 401,
    })
  }
}

export class AttachmentNotFoundError extends DomainException {
  constructor() {
    super({
      code: "ATTACHMENT_NOT_FOUND",
      title: "Attachment not found",
      status: 404,
    })
  }
}

export class InvalidAttachmentError extends DomainException {
  constructor() {
    super({
      code: "INVALID_ATTACHMENT",
      title: "Attachment is missing or too large",
      status: 400,
    })
  }
}

export class InvalidAvatarError extends DomainException {
  constructor() {
    super({
      code: "INVALID_AVATAR",
      title: "Avatar must be an image up to 2MB",
      status: 400,
    })
  }
}

export class StorageUnavailableError extends DomainException {
  constructor() {
    super({
      code: "STORAGE_UNAVAILABLE",
      title: "Object storage is not configured",
      status: 503,
    })
  }
}

export class SessionNotFoundError extends DomainException {
  constructor() {
    super({
      code: "SESSION_NOT_FOUND",
      title: "Session not found",
      status: 404,
    })
  }
}

export class InvalidTokenError extends DomainException {
  constructor() {
    super({
      code: "INVALID_TOKEN",
      title: "Token is invalid or expired",
      status: 400,
    })
  }
}

export class ResetCodeInvalidError extends DomainException {
  constructor() {
    super({
      code: "RESET_CODE_INVALID",
      title: "The code is incorrect or has expired",
      status: 400,
    })
  }
}

export class TwoFactorNotEnabledError extends DomainException {
  constructor() {
    super({
      code: "TWO_FACTOR_NOT_ENABLED",
      title: "Two-factor authentication is not enabled",
      status: 409,
    })
  }
}

export class TwoFactorRequiredError extends DomainException {
  constructor() {
    super({
      code: "TWO_FACTOR_REQUIRED",
      title: "Your role requires two-factor authentication",
      status: 403,
    })
  }
}
