import { Module } from "@nestjs/common"
import { ApiKeysService } from "./application/api-keys.service"
import { ApiKeysController } from "./interface/api-keys.controller"

@Module({ providers: [ApiKeysService], controllers: [ApiKeysController] })
export class ApiKeysModule {}
