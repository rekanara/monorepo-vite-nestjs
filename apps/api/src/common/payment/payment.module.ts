import { Global, Module } from "@nestjs/common"
import { PAYMENT_GATEWAY } from "./payment-gateway.port"
import { MidtransPaymentGateway } from "./midtrans-payment.gateway"

@Global()
@Module({
  providers: [{ provide: PAYMENT_GATEWAY, useClass: MidtransPaymentGateway }],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentModule {}
