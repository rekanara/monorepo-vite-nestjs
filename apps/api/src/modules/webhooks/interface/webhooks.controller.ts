import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common"
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger"
import { Throttle } from "@nestjs/throttler"
import { z } from "zod"
import {
  WebhookEventQuerySchema,
  type WebhookEventQuery,
} from "@workspace/contracts"
import { Audited } from "../../../common/audit/audited.decorator"
import { Public } from "../../../common/auth-public.decorator"
import { PermissionGuard } from "../../../common/rbac/permission-guard"
import { RequirePermission } from "../../../common/rbac/require-permission.decorator"
import { ZodValidationPipe } from "../../../common/pipes/zod-validation.pipe"
import { WebhooksService } from "../application/webhooks.service"

const MidtransWebhookSchema = z
  .object({
    order_id: z.string().min(1).max(100),
    status_code: z.string().min(1).max(10),
    gross_amount: z.string().min(1).max(30),
    signature_key: z.string().regex(/^[a-f0-9]{128}$/i),
    transaction_status: z.string().max(50).optional(),
    transaction_id: z.string().max(100).optional(),
  })
  .catchall(z.string())

type MidtransWebhook = z.infer<typeof MidtransWebhookSchema>

const webhookThrottleLimit = () =>
  Number(process.env.WEBHOOK_THROTTLE_LIMIT ?? 300)

@ApiTags("Webhooks")
@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @ApiOperation({ summary: "List webhook events" })
  @ApiBearerAuth("JWT-auth")
  @Get("events")
  @UseGuards(PermissionGuard)
  @RequirePermission("webhooks.manage")
  list(
    @Query(new ZodValidationPipe(WebhookEventQuerySchema)) q: WebhookEventQuery
  ) {
    return this.webhooks.list(q)
  }

  @ApiOperation({ summary: "Replay failed webhook event" })
  @ApiBearerAuth("JWT-auth")
  @Post("events/:id/replay")
  @HttpCode(200)
  @UseGuards(PermissionGuard)
  @RequirePermission("webhooks.manage")
  @Audited("webhook.replay", "webhook_event")
  replay(@Param("id", ParseUUIDPipe) id: string) {
    return this.webhooks.replay(id)
  }

  @ApiOperation({ summary: "Midtrans payment notification webhook" })
  @Public()
  @Post("midtrans")
  @HttpCode(200)
  // Providers retry in bursts; keep it bounded but well above normal volume.
  @Throttle({ default: { ttl: 60_000, limit: webhookThrottleLimit } })
  receiveMidtrans(
    @Body(new ZodValidationPipe(MidtransWebhookSchema)) body: MidtransWebhook
  ) {
    return this.webhooks.receiveMidtrans(body)
  }
}
