import { Module } from "@nestjs/common"
import { ScheduleModule } from "@nestjs/schedule"
import { MaintenanceService } from "./application/maintenance.service"
import { MaintenanceController } from "./interface/maintenance.controller"

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
