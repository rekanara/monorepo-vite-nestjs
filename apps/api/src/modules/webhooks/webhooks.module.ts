import { Module } from "@nestjs/common"
import { WebhooksService } from "./application/webhooks.service"
import { WebhooksController } from "./interface/webhooks.controller"

@Module({ controllers: [WebhooksController], providers: [WebhooksService] })
export class WebhooksModule {}
