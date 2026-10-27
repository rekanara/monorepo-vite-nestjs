import { Module } from "@nestjs/common"
import { PushModule } from "../../common/push/push.module"
import { SystemController } from "./system.controller"

@Module({ imports: [PushModule], controllers: [SystemController] })
export class SystemModule {}
