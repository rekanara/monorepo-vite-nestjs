import { Inject, Injectable, Logger } from "@nestjs/common"
import type { Prisma } from "@prisma/client"
import { type WebhookEventQuery } from "@workspace/contracts"
import { DomainException } from "../../../common/errors/domain-exception"
import { Paged } from "../../../common/http/response-envelope.interceptor"
import { generateId } from "../../../common/ids/id-generator"
import {
  PAYMENT_GATEWAY,
  type PaymentGatewayPort,
} from "../../../common/payment/payment-gateway.port"
import { PrismaService } from "../../../common/prisma/prisma.service"

class WebhookError extends DomainException {}

type MidtransPayload = Record<string, string>

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name)

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly payment: PaymentGatewayPort
  ) {}

  /** Verifies, stores once, then marks processed. Duplicate deliveries are 200. */
  async receiveMidtrans(
    payload: MidtransPayload
  ): Promise<{ duplicate: boolean }> {
    if (!this.payment.enabled)
      throw new WebhookError({
        code: "WEBHOOK_PROVIDER_DISABLED",
        title: "Midtrans is not configured",
        status: 503,
      })
    if (!this.payment.verifyNotification(payload))
      throw new WebhookError({
        code: "INVALID_WEBHOOK_SIGNATURE",
        title: "Invalid webhook signature",
        status: 401,
      })
    const eventKey = this.midtransKey(payload)
    let eventId: string
    try {
      eventId = (
        await this.prisma.webhookEvent.create({
          data: {
            id: generateId(),
            provider: "midtrans",
            eventKey,
            eventType: payload.transaction_status ?? "unknown",
            payload: payload as Prisma.InputJsonValue,
          },
        })
      ).id
    } catch (err) {
      if (!this.isDuplicate(err)) throw err
      // Only a failed earlier attempt is worth retrying; claim it atomically
      // so two concurrent retries cannot both reprocess it.
      const existing = await this.prisma.webhookEvent.findUniqueOrThrow({
        where: { provider_eventKey: { provider: "midtrans", eventKey } },
      })
      const claim = await this.prisma.webhookEvent.updateMany({
        where: { id: existing.id, status: "failed" },
        data: { status: "received", error: null },
      })
      if (claim.count === 0) return { duplicate: true }
      eventId = existing.id
    }
    try {
      // ponytail: no payment domain yet. Handle settlement/expire/cancel
      // here (e.g. mark an order paid) once orders exist.
      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: { status: "processed", processedAt: new Date() },
      })
    } catch (err) {
      // Keep the stored event as "failed" so it can be inspected and replayed;
      // a 5xx makes Midtrans retry, and the retry is then de-duplicated.
      this.logger.error(`Midtrans webhook ${eventKey} failed: ${String(err)}`)
      await this.prisma.webhookEvent
        .update({
          where: { id: eventId },
          data: { status: "failed", error: String(err).slice(0, 1000) },
        })
        .catch(() => undefined)
      throw err
    }
    return { duplicate: false }
  }

  async list(query: WebhookEventQuery) {
    const where = {
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.status ? { status: query.status } : {}),
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.webhookEvent.findMany({
        where,
        orderBy: { receivedAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.webhookEvent.count({ where }),
    ])
    return Paged.of(
      items.map((e) => ({
        id: e.id,
        provider: e.provider,
        eventKey: e.eventKey,
        eventType: e.eventType,
        payload: e.payload,
        status: e.status,
        error: e.error,
        receivedAt: e.receivedAt.toISOString(),
        processedAt: e.processedAt?.toISOString() ?? null,
      })),
      total,
      query.page,
      query.limit
    )
  }

  async replay(id: string): Promise<{ duplicate: boolean }> {
    const event = await this.prisma.webhookEvent.findUnique({ where: { id } })
    if (!event)
      throw new WebhookError({
        code: "WEBHOOK_EVENT_NOT_FOUND",
        title: "Webhook event not found",
        status: 404,
      })
    if (event.provider !== "midtrans")
      throw new WebhookError({
        code: "WEBHOOK_PROVIDER_UNSUPPORTED",
        title: "Webhook provider is not supported",
        status: 400,
      })
    if (event.status !== "failed")
      throw new WebhookError({
        code: "WEBHOOK_REPLAY_NOT_FAILED",
        title: "Only failed webhook events can be replayed",
        status: 400,
      })
    return this.receiveMidtrans(event.payload as MidtransPayload)
  }

  private midtransKey(payload: MidtransPayload): string {
    return [
      payload.order_id,
      payload.transaction_id,
      payload.transaction_status,
      payload.status_code,
      payload.gross_amount,
    ]
      .map((v) => v ?? "")
      .join(":")
  }

  private isDuplicate(err: unknown): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    )
  }
}
