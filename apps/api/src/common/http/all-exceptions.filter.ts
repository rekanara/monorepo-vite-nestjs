import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common"
import { Prisma } from "@prisma/client"
import type { Response } from "express"
import { DomainException } from "../errors/domain-exception"
import { captureException } from "../observability/sentry"
import { envelope, statusName } from "./envelope"

interface Normalized {
  status: number
  code: string
  message: string
  detail?: string
}

function fromHttpException(e: HttpException): Normalized {
  const status = e.getStatus()
  const body = e.getResponse()
  if (typeof body === "object" && body !== null) {
    const b = body as Record<string, unknown>
    const detail =
      typeof b.detail === "string"
        ? b.detail
        : Array.isArray(b.message)
          ? b.message.join("; ")
          : undefined
    return {
      status,
      code:
        typeof b.code === "string"
          ? b.code
          : statusName(status).toUpperCase().replace(/\s+/g, "_"),
      message:
        typeof b.title === "string"
          ? b.title
          : typeof b.message === "string"
            ? b.message
            : statusName(status),
      detail,
    }
  }
  return {
    status,
    code: statusName(status).toUpperCase().replace(/\s+/g, "_"),
    message: String(body),
  }
}

function fromPrisma(
  e: Prisma.PrismaClientKnownRequestError
): Normalized | null {
  if (e.code === "P2025") {
    return { status: 404, code: "NOT_FOUND", message: "Record not found" }
  }
  if (e.code === "P2002") {
    return { status: 409, code: "CONFLICT", message: "Duplicate value" }
  }
  if (e.code === "P2003") {
    return {
      status: 409,
      code: "CONFLICT",
      message: "Referenced record is in use or missing",
    }
  }
  return null
}

/** Every error leaves the API in the same envelope as successful responses. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    let n: Normalized | null = null

    if (exception instanceof DomainException) {
      n = {
        status: exception.status,
        code: exception.code,
        message: exception.title,
        detail:
          exception.message !== exception.title ? exception.message : undefined,
      }
    } else if (exception instanceof HttpException) {
      n = fromHttpException(exception)
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      n = fromPrisma(exception)
    }

    if (!n) {
      captureException(exception)
      this.logger.error(exception)
      n = {
        status: 500,
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal Server Error",
      }
    }

    res.status(n.status).json(
      envelope({
        data: null,
        code: n.status,
        type: "ERROR",
        message: n.message,
        errorCode: n.code,
        errorDetail: n.detail,
      })
    )
  }
}
