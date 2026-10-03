import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { normalizeNameQuery } from "src/common/utils/normalize-name";
import { getPaginationParams, paginate } from "src/common/utils/pagination";
import { PrismaService } from "src/prisma/prisma.service";
import { PaymentsService } from "../payments/payments.service";
import { CreateBillDto } from "./dto/create-bill.dto";
import { FilterBillsDto } from "./dto/filter-bills.dto";
import { UpdateBillDto } from "./dto/update-bill.dto";
import {
  addDays,
  isPaymentInFlight,
  resolveLateFeeAmount,
  startOfDay,
} from "./late-fee";

const BILL_REMINDER_DAYS_BEFORE = 3;
const BILL_GENERATE_DAYS_BEFORE = 7;

const billListInclude = {
  occupant: {
    select: {
      id: true,
      fullName: true,
      email: true,
      isActive: true,
      room: {
        select: {
          id: true,
          name: true,
          property: {
            select: { id: true, name: true },
          },
        },
      },
    },
  },
  payment: {
    select: {
      id: true,
      status: true,
      amount: true,
      paymentUrl: true,
      qrCode: true,
      expiredAt: true,
      paidAt: true,
      gatewayReference: true,
    },
  },
} satisfies Prisma.BillInclude;

@Injectable()
export class BillsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async findAll(userId: string, query: FilterBillsDto) {
    this.assertDueDateRange(query.dueDateFrom, query.dueDateTo);

    const { page, limit, skip, take } = getPaginationParams(query);
    const where = this.buildFindAllWhere(userId, query);

    const [bills, total] = await this.prismaService.$transaction([
      this.prismaService.bill.findMany({
        where,
        include: billListInclude,
        orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
        skip,
        take,
      }),
      this.prismaService.bill.count({ where }),
    ]);

    return paginate(
      bills.map((bill) => this.toBillResponse(bill)),
      page,
      limit,
      total,
    );
  }

  async findOne(userId: string, billId: string) {
    const bill = await this.prismaService.bill.findFirst({
      where: this.ownerBillWhere(userId, billId),
      include: billListInclude,
    });

    if (!bill) {
      throw new NotFoundException("Bill not found.");
    }

    return this.toBillResponse(bill);
  }

  async cancel(userId: string, billId: string) {
    const bill = await this.prismaService.bill.findFirst({
      where: this.ownerBillWhere(userId, billId),
      include: {
        payment: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!bill) {
      throw new NotFoundException("Bill not found.");
    }

    if (bill.status === "PAID") {
      throw new ConflictException("Paid bills cannot be cancelled.");
    }

    if (bill.status === "CANCELLED") {
      throw new ConflictException("This bill is already cancelled.");
    }

    if (bill.payment?.status === "PENDING") {
      throw new ConflictException(
        "Bills with a pending payment cannot be cancelled.",
      );
    }

    const cancelled = await this.prismaService.bill.update({
      where: {
        id: billId,
      },
      data: {
        status: "CANCELLED",
      },
      include: billListInclude,
    });

    return this.toBillResponse(cancelled);
  }

  async markPaidCash(userId: string, billId: string) {
    await this.paymentsService.markPaidCash(userId, billId);

    return this.findOne(userId, billId);
  }

  async updateManual(userId: string, billId: string, dto: UpdateBillDto) {
    if (
      dto.amount === undefined &&
      dto.dueDate === undefined &&
      dto.description === undefined
    ) {
      throw new BadRequestException("At least one field must be updated.");
    }

    const bill = await this.prismaService.bill.findFirst({
      where: this.ownerBillWhere(userId, billId),
      include: {
        payment: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!bill) {
      throw new NotFoundException("Bill not found.");
    }

    if (bill.type !== "MANUAL") {
      throw new ConflictException("Only manual bills can be edited.");
    }

    if (bill.status === "PAID") {
      throw new ConflictException("Paid bills cannot be edited.");
    }

    if (bill.status === "CANCELLED") {
      throw new ConflictException("Cancelled bills cannot be edited.");
    }

    if (bill.payment?.status === "PENDING") {
      throw new ConflictException(
        "Bills with a pending payment cannot be edited.",
      );
    }

    const nextDueDate =
      dto.dueDate !== undefined ? new Date(dto.dueDate) : bill.dueDate;
    const shouldReopenOverdue =
      bill.status === "OVERDUE" &&
      nextDueDate !== null &&
      startOfDay(nextDueDate) >= startOfDay(new Date());

    const updated = await this.prismaService.bill.update({
      where: {
        id: billId,
      },
      data: {
        ...(dto.amount !== undefined && {
          amount: dto.amount,
        }),
        ...(dto.dueDate !== undefined && {
          dueDate: new Date(dto.dueDate),
        }),
        ...(dto.description !== undefined && {
          description: dto.description,
        }),
        ...(shouldReopenOverdue && {
          status: "UNPAID",
        }),
      },
      include: billListInclude,
    });

    return this.toBillResponse(updated);
  }

  async sendReminders() {
    const today = startOfDay(new Date());
    const reminderDate = addDays(today, BILL_REMINDER_DAYS_BEFORE);

    const bills = await this.prismaService.bill.findMany({
      where: {
        deletedAt: null,
        status: {
          in: ["UNPAID", "OVERDUE", "PENDING"],
        },
        dueDate: {
          not: null,
        },
        OR: [
          {
            dueDate: {
              gte: today,
              lte: this.endOfDay(today),
            },
          },
          {
            dueDate: {
              gte: reminderDate,
              lte: this.endOfDay(reminderDate),
            },
          },
        ],
      },
      select: {
        id: true,
        invoiceNumber: true,
      },
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const bill of bills) {
      try {
        const result = await this.paymentsService.chargeAndNotify(bill.id);

        if (result.sent) {
          sent += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        failed += 1;
        console.error(
          `Failed to send bill reminder for ${bill.invoiceNumber}`,
          error,
        );
      }
    }

    return {
      message: "Bill reminders processed successfully.",
      sent,
      skipped,
      failed,
    };
  }

  async createManual(userId: string, dto: CreateBillDto) {
    const occupant = await this.prismaService.occupant.findFirst({
      where: {
        id: dto.occupantId,
        isActive: true,
        deletedAt: null,

        room: {
          deletedAt: null,

          property: {
            ownerId: userId,
            deletedAt: null,
          },
        },
      },
    });

    if (!occupant) {
      throw new NotFoundException("Occupant not found.");
    }

    const invoiceNumber = await this.generateInvoiceNumber();

    const bill = await this.prismaService.bill.create({
      data: {
        occupantId: dto.occupantId,
        invoiceNumber,
        type: "MANUAL",
        amount: dto.amount,
        dueDate: new Date(dto.dueDate),
        description: dto.description,
        status: "UNPAID",
      },
    });

    await this.notifyOccupant(bill.id);

    return bill;
  }

  /**
   * Bayar di muka: bill periode berikutnya dibuat H-BILL_GENERATE_DAYS_BEFORE
   * sebelum periodStart, dan jatuh tempo di hari periodStart.
   * Bill pertama (periode check-in) selalu dibuat, walau check-in di masa depan.
   */
  async createCurrentMonthlyBill(occupantId: string) {
    const occupant = await this.findActiveOccupantWithRoom(occupantId);

    if (!occupant) {
      return null;
    }

    const periodIndex = this.getLatestBillablePeriodIndex(
      occupant.checkIn,
      new Date(),
    );

    const result = await this.createRentBillForPeriod(occupant, periodIndex);

    return result?.bill ?? null;
  }

  async generateMissingMonthlyBills() {
    const occupants = await this.prismaService.occupant.findMany({
      where: {
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    let created = 0;

    for (const occupant of occupants) {
      const bills = await this.generateMissingMonthlyBillsForOccupant(
        occupant.id,
      );

      if (bills) {
        created += bills.length;
      }
    }

    return {
      message: "Missing bills generated successfully.",
      created,
    };
  }

  async generateMissingMonthlyBillsForOccupant(occupantId: string) {
    const occupant = await this.findActiveOccupantWithRoom(occupantId);

    if (!occupant) {
      return null;
    }

    const latestPeriodIndex = this.getLatestBillablePeriodIndex(
      occupant.checkIn,
      new Date(),
    );

    const createdBills: Prisma.BillGetPayload<{}>[] = [];

    for (let index = 0; index <= latestPeriodIndex; index++) {
      const result = await this.createRentBillForPeriod(occupant, index);

      // null = periode sudah melewati checkOut
      if (!result) {
        break;
      }

      if (result.created) {
        createdBills.push(result.bill);
      }
    }

    return createdBills;
  }

  private findActiveOccupantWithRoom(occupantId: string) {
    return this.prismaService.occupant.findFirst({
      where: {
        id: occupantId,
        isActive: true,
        deletedAt: null,
      },
      include: {
        room: true,
      },
    });
  }

  private async createRentBillForPeriod(
    occupant: Prisma.OccupantGetPayload<{ include: { room: true } }>,
    periodIndex: number,
  ) {
    const periodStart = this.getPeriodStart(occupant.checkIn, periodIndex);
    const periodEnd = addDays(
      this.getPeriodStart(occupant.checkIn, periodIndex + 1),
      -1,
    );

    // Occupant sudah checkout sebelum periode ini dimulai
    if (occupant.checkOut && periodStart >= startOfDay(occupant.checkOut)) {
      return null;
    }

    const existingBill = await this.findRentBillForPeriod(
      occupant.id,
      periodStart,
    );

    if (existingBill) {
      return { bill: existingBill, created: false };
    }

    const invoiceNumber = await this.generateInvoiceNumber();

    let bill: Prisma.BillGetPayload<{}>;

    try {
      bill = await this.prismaService.bill.create({
        data: {
          occupantId: occupant.id,
          invoiceNumber,
          type: "RENT",
          amount: occupant.room.price,
          periodStart,
          periodEnd,
          dueDate: periodStart,
          description: "Monthly room rent",
          status: "UNPAID",
        },
      });
    } catch (error) {
      // Dibuat bersamaan oleh proses lain (mis. cron & create occupant)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const concurrentBill = await this.findRentBillForPeriod(
          occupant.id,
          periodStart,
        );

        if (concurrentBill) {
          return { bill: concurrentBill, created: false };
        }
      }

      throw error;
    }

    await this.notifyOccupant(bill.id, { swallow: true });

    return { bill, created: true };
  }

  private findRentBillForPeriod(occupantId: string, periodStart: Date) {
    return this.prismaService.bill.findFirst({
      where: {
        occupantId,
        type: "RENT",
        periodStart,
        deletedAt: null,
      },
    });
  }

  async processOverdueBills() {
    const today = startOfDay(new Date());

    const overdueBillInclude = {
      payment: true,
      occupant: {
        include: {
          room: {
            include: {
              property: {
                include: {
                  setting: true,
                },
              },
            },
          },
        },
      },
    } satisfies Prisma.BillInclude;

    const bills = await this.prismaService.bill.findMany({
      where: {
        deletedAt: null,
        type: {
          in: ["RENT", "MANUAL"],
        },
        status: {
          in: ["UNPAID", "PENDING", "OVERDUE"],
        },
        dueDate: {
          not: null,
          lt: today,
        },
        paidAt: null,
      },
      include: overdueBillInclude,
    });

    let markedOverdue = 0;
    let lateFeesApplied = 0;
    let skippedInFlight = 0;
    let skippedNoLateFeeSetting = 0;

    for (const bill of bills) {
      const updates: Record<string, unknown> = {};

      if (bill.status !== "OVERDUE") {
        updates.status = "OVERDUE";
        markedOverdue += 1;
      }

      const setting = bill.occupant?.room.property.setting;
      const paymentInFlight = isPaymentInFlight(bill.payment);
      const lateFeeAmount = resolveLateFeeAmount({
        dueDate: bill.dueDate,
        amount: bill.amount,
        currentLateFee: bill.lateFeeAmount,
        payment: bill.payment,
        setting,
        today,
      });

      if (!new Prisma.Decimal(bill.lateFeeAmount).eq(lateFeeAmount)) {
        updates.lateFeeAmount = lateFeeAmount;
        lateFeesApplied += 1;
      } else if (
        paymentInFlight &&
        bill.payment?.amount != null &&
        new Prisma.Decimal(bill.payment.amount).eq(
          new Prisma.Decimal(bill.amount).add(lateFeeAmount),
        )
      ) {
        skippedInFlight += 1;
      } else if (!setting?.lateFeeEnabled) {
        skippedNoLateFeeSetting += 1;
      }

      if (Object.keys(updates).length > 0) {
        await this.prismaService.bill.update({
          where: { id: bill.id },
          data: updates as Prisma.BillUpdateInput,
        });
      }

      if (updates.lateFeeAmount !== undefined) {
        await this.notifyOccupant(bill.id, { swallow: true });
      }
    }

    return {
      message: "Overdue bills processed successfully.",
      scanned: bills.length,
      markedOverdue,
      lateFeesApplied,
      skippedInFlight,
      skippedNoLateFeeSetting,
    };
  }

  private ownerBillWhere(userId: string, billId: string): Prisma.BillWhereInput {
    return {
      id: billId,
      deletedAt: null,
      occupant: {
        room: {
          property: {
            ownerId: userId,
            deletedAt: null,
          },
        },
      },
    };
  }

  private toBillResponse<T extends { amount: Prisma.Decimal; lateFeeAmount: Prisma.Decimal }>(
    bill: T,
  ) {
    return {
      ...bill,
      payableAmount: new Prisma.Decimal(bill.amount).add(bill.lateFeeAmount),
    };
  }

  private buildFindAllWhere(
    userId: string,
    query: FilterBillsDto,
  ): Prisma.BillWhereInput {
    const invoiceNumber = query.invoiceNumber?.trim();
    const occupantName = normalizeNameQuery(query.occupantName);
    const dueDate = this.buildDueDateRange(query.dueDateFrom, query.dueDateTo);

    return {
      deletedAt: null,
      ...(invoiceNumber && {
        invoiceNumber: {
          contains: invoiceNumber,
          mode: "insensitive",
        },
      }),
      ...(query.status && {
        status: query.status,
      }),
      ...(query.type && {
        type: query.type,
      }),
      ...(dueDate && { dueDate }),
      occupant: {
        ...(query.occupantId && {
          id: query.occupantId,
        }),
        ...(occupantName && {
          fullName: {
            contains: occupantName,
            mode: "insensitive",
          },
        }),
        room: {
          ...(query.propertyId && {
            propertyId: query.propertyId,
          }),
          property: {
            ownerId: userId,
            deletedAt: null,
          },
        },
      },
    };
  }

  private buildDueDateRange(dueDateFrom?: string, dueDateTo?: string) {
    if (!dueDateFrom && !dueDateTo) {
      return undefined;
    }

    return {
      ...(dueDateFrom && { gte: startOfDay(new Date(dueDateFrom)) }),
      ...(dueDateTo && { lte: this.endOfDay(new Date(dueDateTo)) }),
    };
  }

  private assertDueDateRange(dueDateFrom?: string, dueDateTo?: string) {
    if (!dueDateFrom || !dueDateTo) {
      return;
    }

    if (new Date(dueDateFrom) > new Date(dueDateTo)) {
      throw new BadRequestException(
        "dueDateFrom cannot be greater than dueDateTo.",
      );
    }
  }

  private endOfDay(date: Date) {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  private async generateInvoiceNumber() {
    const timestamp = Date.now();

    return `INV-${timestamp}`;
  }

  private async notifyOccupant(
    billId: string,
    options?: { swallow?: boolean },
  ) {
    try {
      await this.paymentsService.chargeAndNotify(billId);
    } catch (error) {
      console.error(`Failed to send invoice for bill ${billId}`, error);

      if (!options?.swallow) {
        throw error;
      }
    }
  }

  /**
   * Awal periode ke-n (0 = periode check-in), dihitung dari tanggal check-in
   * asli supaya tidak bergeser. Tanggal 29-31 di-clamp ke akhir bulan:
   * check-in 31 Jan -> 28 Feb -> 31 Mar -> 30 Apr.
   * Hasilnya tanggal kalender WIB dalam UTC midnight (sama dengan startOfDay).
   */
  private getPeriodStart(checkIn: Date, periodIndex: number) {
    const anchor = startOfDay(checkIn);
    const anchorDay = anchor.getUTCDate();

    const firstOfMonth = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + periodIndex, 1),
    );
    const lastDayOfMonth = new Date(
      Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0),
    ).getUTCDate();

    firstOfMonth.setUTCDate(Math.min(anchorDay, lastDayOfMonth));

    return firstOfMonth;
  }

  // Index periode terakhir yang periodStart-nya <= hari ini + BILL_GENERATE_DAYS_BEFORE
  private getLatestBillablePeriodIndex(checkIn: Date, today: Date) {
    const generateUntil = addDays(today, BILL_GENERATE_DAYS_BEFORE);
    const anchor = startOfDay(checkIn);

    let periodIndex =
      (generateUntil.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
      (generateUntil.getUTCMonth() - anchor.getUTCMonth());

    if (this.getPeriodStart(checkIn, periodIndex) > generateUntil) {
      periodIndex -= 1;
    }

    return Math.max(periodIndex, 0);
  }
}
