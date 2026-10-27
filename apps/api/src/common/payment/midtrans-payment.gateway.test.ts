import { createHash } from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"
import { MidtransPaymentGateway } from "./midtrans-payment.gateway"

const KEY = "SB-Mid-server-test"
const sign = (b: Record<string, string>) =>
  createHash("sha512")
    .update(`${b.order_id}${b.status_code}${b.gross_amount}${KEY}`)
    .digest("hex")

describe("MidtransPaymentGateway.verifyNotification", () => {
  const original = process.env.MIDTRANS_SERVER_KEY
  afterEach(() => {
    process.env.MIDTRANS_SERVER_KEY = original
  })

  it("accepts the documented sha512 signature and rejects tampering", () => {
    process.env.MIDTRANS_SERVER_KEY = KEY
    const gateway = new MidtransPaymentGateway()
    const body = {
      order_id: "O-1",
      status_code: "200",
      gross_amount: "10000.00",
    }
    expect(
      gateway.verifyNotification({ ...body, signature_key: sign(body) })
    ).toBe(true)
    expect(
      gateway.verifyNotification({
        ...body,
        gross_amount: "1.00",
        signature_key: sign(body),
      })
    ).toBe(false)
    expect(gateway.verifyNotification({ ...body, signature_key: "x" })).toBe(
      false
    )
  })

  it("rejects everything when not configured", () => {
    process.env.MIDTRANS_SERVER_KEY = ""
    expect(
      new MidtransPaymentGateway().verifyNotification({ signature_key: "a" })
    ).toBe(false)
  })
})
