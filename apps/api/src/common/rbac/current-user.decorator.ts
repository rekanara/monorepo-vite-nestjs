import { createParamDecorator, ExecutionContext } from "@nestjs/common"
import type { AuthenticatedUser } from "../../modules/auth/interface/jwt.strategy"
import type { ScopeFilter } from "./scope.types"

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser =>
    ctx.switchToHttp().getRequest().user
)

export const CurrentScope = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ScopeFilter =>
    ctx.switchToHttp().getRequest().scope
)
