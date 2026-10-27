import { createHash, timingSafeEqual } from "node:crypto"
import { Injectable } from "@nestjs/common"
import { loadEnv } from "../config/env.schema"
import type {
  CreatePaymentInput,
  PaymentGatewayPort,
  PaymentSession,
} from "./payment-gateway.port"

/** Midtrans Snap over plain fetch. Disabled without MIDTRANS_SERVER_KEY. */
@Injectable()
export class MidtransPaymentGateway implements PaymentGatewayPort {
  private readonly serverKey: string
  private readonly snapUrl: string
  readonly enabled: boolean

  constructor() {
    const env = loadEnv()
    this.serverKey = env.MIDTRANS_SERVER_KEY ?? ""
    this.enabled = Boolean(this.serverKey)
    this.snapUrl =
      env.MIDTRANS_IS_PRODUCTION === "true"
        ? "https://app.midtrans.com/snap/v1/transactions"
        : "https://app.sandbox.midtrans.com/snap/v1/transactions"
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentSession> {
    if (!this.enabled) throw new Error("Midtrans is not configured")
    const res = await fetch(this.snapUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${this.serverKey}:`).toString("base64")}`,
      },
      body: JSON.stringify({
        transaction_details: {
          order_id: input.orderId,
          gross_amount: input.amount,
        },
        customer_details: input.customer && {
          first_name: input.customer.name,
          email: input.customer.email,
        },
      }),
    })
    if (!res.ok) {
      throw new Error(`Midtrans error ${res.status}: ${await res.text()}`)
    }
    const body = (await res.json()) as { token: string; redirect_url: string }
    return { token: body.token, redirectUrl: body.redirect_url }
  }

  verifyNotification(body: Record<string, string>): boolean {
    if (!this.enabled || !body.signature_key) return false
    const expected = createHash("sha512")
      .update(
        `${body.order_id}${body.status_code}${body.gross_amount}${this.serverKey}`
      )
      .digest("hex")
    const a = Buffer.from(expected)
    const b = Buffer.from(body.signature_key)
    return a.length === b.length && timingSafeEqual(a, b)
  }
}
