import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { BillsService } from "./bills.service";
import { Cron, CronExpression } from "@nestjs/schedule";
import { BUSINESS_TIMEZONE } from "./late-fee";

@Injectable()
export class BillScheduller {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly billService: BillsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: BUSINESS_TIMEZONE })
  async generateMonthlyBills() {
    const occupants = await this.prismaService.occupant.findMany({
      where: {
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    for (const occupant of occupants) {
      try {
        await this.billService.createCurrentMonthlyBill(occupant.id);
      } catch (error) {
        console.error(
          `Failed to generate bill for occupant ${occupant.id}`,
          error,
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: BUSINESS_TIMEZONE })
  async processOverdueBills() {
    try {
      await this.billService.processOverdueBills();
    } catch (error) {
      console.error("Failed to process overdue bills", error);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: BUSINESS_TIMEZONE })
  async sendBillReminders() {
    try {
      await this.billService.sendReminders();
    } catch (error) {
      console.error("Failed to send bill reminders", error);
    }
  }
}
