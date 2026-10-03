import { Module } from "@nestjs/common";

import { PaymentsModule } from "../payments/payments.module";
import { BillScheduller } from "./bill.scheduler";
import { BillsController } from "./bills.controller";
import { BillsService } from "./bills.service";

@Module({
  imports: [PaymentsModule],
  providers: [BillsService, BillScheduller],
  controllers: [BillsController],
  exports: [BillsService],
})
export class BillsModule {}
