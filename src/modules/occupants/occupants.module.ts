import { Module } from "@nestjs/common";

import { BillsModule } from "../bills/bills.module";
import { MailModule } from "../mail/mail.module";
import { OccupantsController } from "./occupants.controller";
import { OccupantsService } from "./occupants.service";

@Module({
  imports: [BillsModule, MailModule],
  providers: [OccupantsService],
  controllers: [OccupantsController],
})
export class OccupantsModule {}
