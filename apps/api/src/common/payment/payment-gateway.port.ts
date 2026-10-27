export interface CreatePaymentInput {
  orderId: string
  amount: number
  customer?: { name?: string; email?: string }
}

export interface PaymentSession {
  token: string
  redirectUrl: string
}

export interface PaymentGatewayPort {
  readonly enabled: boolean
  createPayment(input: CreatePaymentInput): Promise<PaymentSession>
  /** True when a webhook notification is genuinely from the gateway. */
  verifyNotification(body: Record<string, string>): boolean
}

export const PAYMENT_GATEWAY = Symbol("PAYMENT_GATEWAY")
