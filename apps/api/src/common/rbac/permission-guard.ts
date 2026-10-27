import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { REQUIRE_PERMISSION_KEY } from "./require-permission.decorator"
import { ScopeResolver } from "./scope-resolver"

@Injectable()
export class PermissionGuard {
  constructor(
    private readonly reflector: Reflector,
    private readonly scopeResolver: ScopeResolver
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<
      string | undefined
    >(REQUIRE_PERMISSION_KEY, [context.getHandler(), context.getClass()])
    if (!requiredPermission) {
      throw new ForbiddenException({
        code: "PERMISSION_NOT_DECLARED",
        title: "Route has no declared permission",
      })
    }
    const request = context.switchToHttp().getRequest()
    const user = request.user
    if (!user) {
      throw new UnauthorizedException({
        code: "NOT_AUTHENTICATED",
        title: "No authenticated user on request",
      })
    }
    request.scope = await this.scopeResolver.resolve(user, requiredPermission)
    return true
  }
}
