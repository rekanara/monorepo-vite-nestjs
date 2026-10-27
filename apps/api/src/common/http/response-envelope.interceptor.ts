import {
  StreamableFile,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common"
import type { Response } from "express"
import { map, Observable } from "rxjs"
import { envelope } from "./envelope"

/** Marker a handler returns to put list metadata next to `data`. */
export class Paged<T> {
  constructor(
    readonly items: T[],
    readonly meta: {
      total: number
      page: number
      limit: number
      totalPages: number
    } & Record<string, unknown>
  ) {}

  static of<T>(
    items: T[],
    total: number,
    page: number,
    limit: number,
    extra: Record<string, unknown> = {}
  ) {
    return new Paged(items, {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      ...extra,
    })
  }
}

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>()
    return next.handle().pipe(
      map((body) => {
        // 204 must have no body; express drops it anyway, keep it explicit.
        if (res.statusCode === 204) return undefined
        // File downloads must reach the client as-is, not wrapped in the envelope.
        if (body instanceof StreamableFile) return body
        if (body instanceof Paged) {
          return envelope({
            data: body.items,
            meta: body.meta,
            code: res.statusCode,
            type: "SUCCESS",
          })
        }
        return envelope({
          data: body ?? null,
          code: res.statusCode,
          type: "SUCCESS",
        })
      })
    )
  }
}
