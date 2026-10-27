import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common"
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger"
import {
  CreateApiKeyRequestSchema,
  UpdateApiKeyRequestSchema,
  type CreateApiKeyRequest,
  type UpdateApiKeyRequest,
} from "@workspace/contracts"
import { Audited } from "../../../common/audit/audited.decorator"
import { ZodValidationPipe } from "../../../common/pipes/zod-validation.pipe"
import { PermissionGuard } from "../../../common/rbac/permission-guard"
import { RequirePermission } from "../../../common/rbac/require-permission.decorator"
import { ApiKeysService } from "../application/api-keys.service"

@ApiTags("API Keys")
@ApiBearerAuth("JWT-auth")
@Controller("api-keys")
@UseGuards(PermissionGuard)
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @ApiOperation({ summary: "List API keys" })
  @Get()
  @RequirePermission("apiKeys.manage")
  list() {
    return this.apiKeys.list()
  }

  @ApiOperation({ summary: "Create API key" })
  @Post()
  @RequirePermission("apiKeys.manage")
  @Audited("api_key.create", "api_key")
  create(
    @Body(new ZodValidationPipe(CreateApiKeyRequestSchema))
    body: CreateApiKeyRequest
  ) {
    return this.apiKeys.create(body)
  }

  @ApiOperation({ summary: "Update API key" })
  @Patch(":id")
  @RequirePermission("apiKeys.manage")
  @Audited("api_key.update", "api_key")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateApiKeyRequestSchema))
    body: UpdateApiKeyRequest
  ) {
    return this.apiKeys.update(id, body)
  }

  @ApiOperation({ summary: "Delete API key" })
  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("apiKeys.manage")
  @Audited("api_key.delete", "api_key")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.apiKeys.remove(id)
  }
}
