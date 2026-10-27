import {
  StreamableFile,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { mergeMap, Observable } from "rxjs"
import { AUDITED_KEY, AuditedMetadata } from "./audited.decorator"
import { AuditService } from "./audit.service"

@Injectable()
export class AuditedInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.get<AuditedMetadata | undefined>(
      AUDITED_KEY,
      context.getHandler()
    )
    if (!metadata) {
      return next.handle()
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { id: string }; params: Record<string, string> }>()
    const before = { ...request.params }

    return next.handle().pipe(
      mergeMap(async (result) => {
        // Interceptor order isn't guaranteed: unwrap the response envelope if
        // it was already applied, so the audit row stores the entity itself.
        const after =
          result instanceof StreamableFile
            ? { file: true }
            : result &&
                typeof result === "object" &&
                "status" in result &&
                "data" in result
              ? (result as { data: unknown }).data
              : result
        // Awaited (not fire-and-forget): letting the response complete before the audit
        // row lands raced the client's very next read of it (observed as a real, if rare,
        // e2e flake). A failed write is still logged and swallowed rather than failing the
        // request — audit failures shouldn't turn a successful action into an error response.
        try {
          const entityId =
            request.params.id ||
            (after as { id?: string } | undefined)?.id ||
            ""
          await this.auditService.record({
            actorUserId: request.user?.id ?? null,
            action: metadata.action,
            entityType: metadata.entityType,
            entityId,
            before,
            after,
          })
        } catch (err: unknown) {
          console.error("Audit write failed", err)
        }
        return result
      })
    )
  }
}
