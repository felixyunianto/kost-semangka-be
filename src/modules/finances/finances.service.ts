import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FinanceCategory, FinanceType, Prisma } from "@prisma/client";

import { getPaginationParams, paginate } from "src/common/utils/pagination";
import { PrismaService } from "src/prisma/prisma.service";
import {
  calendarDateKey,
  endOfBusinessInstant,
  startOfBusinessInstant,
  startOfDay,
} from "../bills/late-fee";
import { CreateFinanceEntryDto } from "./dto/create-finance-entry.dto";
import { FilterFinanceEntriesDto } from "./dto/filter-finance-entries.dto";
import { FilterFinanceReportDto } from "./dto/filter-finance-report.dto";
import { UpdateFinanceEntryDto } from "./dto/update-finance-entry.dto";

const entryInclude = {
  property: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.FinanceEntryInclude;

@Injectable()
export class FinancesService {
  constructor(private readonly prismaService: PrismaService) {}

  createIncome(userId: string, dto: CreateFinanceEntryDto) {
    return this.createEntry(userId, FinanceType.INCOME, dto);
  }

  createExpense(userId: string, dto: CreateFinanceEntryDto) {
    return this.createEntry(userId, FinanceType.EXPENSE, dto);
  }

  findIncomes(userId: string, query: FilterFinanceEntriesDto) {
    return this.findEntries(userId, FinanceType.INCOME, query);
  }

  findExpenses(userId: string, query: FilterFinanceEntriesDto) {
    return this.findEntries(userId, FinanceType.EXPENSE, query);
  }

  findIncome(userId: string, entryId: string) {
    return this.findEntry(userId, entryId, FinanceType.INCOME);
  }

  findExpense(userId: string, entryId: string) {
    return this.findEntry(userId, entryId, FinanceType.EXPENSE);
  }

  updateIncome(userId: string, entryId: string, dto: UpdateFinanceEntryDto) {
    return this.updateEntry(userId, entryId, FinanceType.INCOME, dto);
  }

  updateExpense(userId: string, entryId: string, dto: UpdateFinanceEntryDto) {
    return this.updateEntry(userId, entryId, FinanceType.EXPENSE, dto);
  }

  removeIncome(userId: string, entryId: string) {
    return this.removeEntry(userId, entryId, FinanceType.INCOME);
  }

  removeExpense(userId: string, entryId: string) {
    return this.removeEntry(userId, entryId, FinanceType.EXPENSE);
  }

  async getReport(userId: string, query: FilterFinanceReportDto) {
    this.assertDateRange(query.from, query.to);

    if (query.propertyId) {
      await this.assertOwnerProperty(userId, query.propertyId);
    }

    const { from, to } = this.resolveReportPeriod(query.from, query.to);
    const propertyWhere: Prisma.PropertyWhereInput = {
      ownerId: userId,
      deletedAt: null,
      ...(query.propertyId && { id: query.propertyId }),
    };

    const entryWhere: Prisma.FinanceEntryWhereInput = {
      deletedAt: null,
      occurredAt: {
        gte: startOfDay(from),
        lte: startOfDay(to),
      },
      property: propertyWhere,
    };

    const [manualIncomes, expenses, paidBills] = await Promise.all([
      this.prismaService.financeEntry.findMany({
        where: {
          ...entryWhere,
          type: FinanceType.INCOME,
        },
        select: {
          category: true,
          amount: true,
          occurredAt: true,
        },
      }),
      this.prismaService.financeEntry.findMany({
        where: {
          ...entryWhere,
          type: FinanceType.EXPENSE,
        },
        select: {
          category: true,
          amount: true,
          occurredAt: true,
        },
      }),
      this.prismaService.bill.findMany({
        where: {
          deletedAt: null,
          status: "PAID",
          paidAt: {
            gte: startOfBusinessInstant(from),
            lte: endOfBusinessInstant(to),
          },
          occupant: {
            room: {
              property: propertyWhere,
            },
          },
        },
        select: {
          amount: true,
          lateFeeAmount: true,
          paidAt: true,
        },
      }),
    ]);

    const rentalAmount = paidBills.reduce(
      (total, bill) =>
        total.add(bill.amount).add(bill.lateFeeAmount),
      new Prisma.Decimal(0),
    );
    const otherIncomeAmount = this.sumAmounts(manualIncomes);
    const expenseAmount = this.sumAmounts(expenses);
    const incomeTotal = rentalAmount.add(otherIncomeAmount);

    return {
      period: {
        from: calendarDateKey(from),
        to: calendarDateKey(to),
      },
      propertyId: query.propertyId ?? null,
      income: {
        rental: {
          count: paidBills.length,
          amount: rentalAmount,
        },
        other: {
          count: manualIncomes.length,
          amount: otherIncomeAmount,
          byCategory: this.groupByCategory(manualIncomes),
        },
        total: incomeTotal,
      },
      expense: {
        count: expenses.length,
        amount: expenseAmount,
        byCategory: this.groupByCategory(expenses),
      },
      net: incomeTotal.sub(expenseAmount),
      monthly: this.buildMonthlySeries(
        from,
        to,
        paidBills,
        manualIncomes,
        expenses,
      ),
    };
  }

  private async createEntry(
    userId: string,
    type: FinanceType,
    dto: CreateFinanceEntryDto,
  ) {
    await this.assertOwnerProperty(userId, dto.propertyId);

    const entry = await this.prismaService.financeEntry.create({
      data: {
        propertyId: dto.propertyId,
        type,
        category: dto.category,
        amount: dto.amount,
        occurredAt: new Date(dto.occurredAt),
        description: dto.description,
        notes: dto.notes,
      },
      include: entryInclude,
    });

    return entry;
  }

  private async findEntries(
    userId: string,
    type: FinanceType,
    query: FilterFinanceEntriesDto,
  ) {
    const occurredFrom = query.occurredFrom ?? query.from;
    const occurredTo = query.occurredTo ?? query.to;

    this.assertDateRange(occurredFrom, occurredTo);
    this.assertAmountRange(query.minAmount, query.maxAmount);

    if (query.propertyId) {
      await this.assertOwnerProperty(userId, query.propertyId);
    }

    const { page, limit, skip, take } = getPaginationParams(query);
    const where = this.buildFindWhere(userId, type, query);

    const [items, total] = await this.prismaService.$transaction([
      this.prismaService.financeEntry.findMany({
        where,
        include: entryInclude,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        skip,
        take,
      }),
      this.prismaService.financeEntry.count({ where }),
    ]);

    return paginate(items, page, limit, total);
  }

  private async findEntry(
    userId: string,
    entryId: string,
    type: FinanceType,
  ) {
    const entry = await this.prismaService.financeEntry.findFirst({
      where: this.ownerEntryWhere(userId, entryId, type),
      include: entryInclude,
    });

    if (!entry) {
      throw new NotFoundException("Finance entry not found.");
    }

    return entry;
  }

  private async updateEntry(
    userId: string,
    entryId: string,
    type: FinanceType,
    dto: UpdateFinanceEntryDto,
  ) {
    if (
      dto.category === undefined &&
      dto.amount === undefined &&
      dto.occurredAt === undefined &&
      dto.description === undefined &&
      dto.notes === undefined
    ) {
      throw new BadRequestException("At least one field must be updated.");
    }

    await this.findEntry(userId, entryId, type);

    return this.prismaService.financeEntry.update({
      where: {
        id: entryId,
      },
      data: {
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.occurredAt !== undefined && {
          occurredAt: new Date(dto.occurredAt),
        }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: entryInclude,
    });
  }

  private async removeEntry(
    userId: string,
    entryId: string,
    type: FinanceType,
  ) {
    await this.findEntry(userId, entryId, type);

    await this.prismaService.financeEntry.update({
      where: {
        id: entryId,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return {
      message:
        type === FinanceType.INCOME
          ? "Income deleted successfully."
          : "Expense deleted successfully.",
    };
  }

  private buildFindWhere(
    userId: string,
    type: FinanceType,
    query: FilterFinanceEntriesDto,
  ): Prisma.FinanceEntryWhereInput {
    const search = query.search?.trim();
    const description = query.description?.trim();
    const occurredAt = this.buildOccurredRange(
      query.occurredFrom ?? query.from,
      query.occurredTo ?? query.to,
    );

    return {
      deletedAt: null,
      type,
      ...(query.category && { category: query.category }),
      ...(search && {
        OR: [
          {
            description: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            notes: {
              contains: search,
              mode: "insensitive",
            },
          },
        ],
      }),
      ...(description &&
        !search && {
          description: {
            contains: description,
            mode: "insensitive",
          },
        }),
      ...(query.minAmount !== undefined || query.maxAmount !== undefined
        ? {
            amount: {
              ...(query.minAmount !== undefined && { gte: query.minAmount }),
              ...(query.maxAmount !== undefined && { lte: query.maxAmount }),
            },
          }
        : {}),
      ...(occurredAt && { occurredAt }),
      property: {
        ownerId: userId,
        deletedAt: null,
        ...(query.propertyId && { id: query.propertyId }),
      },
    };
  }

  private ownerEntryWhere(
    userId: string,
    entryId: string,
    type: FinanceType,
  ): Prisma.FinanceEntryWhereInput {
    return {
      id: entryId,
      type,
      deletedAt: null,
      property: {
        ownerId: userId,
        deletedAt: null,
      },
    };
  }

  private async assertOwnerProperty(userId: string, propertyId: string) {
    const property = await this.prismaService.property.findFirst({
      where: {
        id: propertyId,
        ownerId: userId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!property) {
      throw new NotFoundException("Property not found.");
    }
  }

  private assertAmountRange(minAmount?: number, maxAmount?: number) {
    if (minAmount === undefined || maxAmount === undefined) {
      return;
    }

    if (minAmount > maxAmount) {
      throw new BadRequestException(
        "minAmount cannot be greater than maxAmount.",
      );
    }
  }

  private assertDateRange(from?: string, to?: string) {
    if (!from || !to) {
      return;
    }

    if (new Date(from) > new Date(to)) {
      throw new BadRequestException(
        "Start date cannot be greater than end date.",
      );
    }
  }

  private buildOccurredRange(from?: string, to?: string) {
    if (!from && !to) {
      return undefined;
    }

    return {
      ...(from && { gte: startOfDay(new Date(from)) }),
      ...(to && { lte: startOfDay(new Date(to)) }),
    };
  }

  private resolveReportPeriod(from?: string, to?: string) {
    if (from && to) {
      return {
        from: new Date(from),
        to: new Date(to),
      };
    }

    const today = new Date();
    const monthStart = new Date(
      `${calendarDateKey(today).slice(0, 7)}-01T00:00:00.000Z`,
    );

    return {
      from: from ? new Date(from) : monthStart,
      to: to ? new Date(to) : today,
    };
  }

  private sumAmounts(entries: Array<{ amount: Prisma.Decimal }>) {
    return entries.reduce(
      (total, entry) => total.add(entry.amount),
      new Prisma.Decimal(0),
    );
  }

  private groupByCategory(
    entries: Array<{ category: FinanceCategory; amount: Prisma.Decimal }>,
  ) {
    const grouped = new Map<
      FinanceCategory,
      { count: number; amount: Prisma.Decimal }
    >();

    for (const entry of entries) {
      const current = grouped.get(entry.category) ?? {
        count: 0,
        amount: new Prisma.Decimal(0),
      };

      grouped.set(entry.category, {
        count: current.count + 1,
        amount: current.amount.add(entry.amount),
      });
    }

    return [...grouped.entries()]
      .map(([category, value]) => ({
        category,
        count: value.count,
        amount: value.amount,
      }))
      .sort((left, right) => left.category.localeCompare(right.category));
  }

  private buildMonthlySeries(
    from: Date,
    to: Date,
    paidBills: Array<{
      amount: Prisma.Decimal;
      lateFeeAmount: Prisma.Decimal;
      paidAt: Date | null;
    }>,
    incomes: Array<{ amount: Prisma.Decimal; occurredAt: Date }>,
    expenses: Array<{ amount: Prisma.Decimal; occurredAt: Date }>,
  ) {
    const months: string[] = [];
    const cursor = new Date(
      `${calendarDateKey(from).slice(0, 7)}-01T00:00:00.000Z`,
    );
    const last = calendarDateKey(to).slice(0, 7);

    while (calendarDateKey(cursor).slice(0, 7) <= last) {
      months.push(calendarDateKey(cursor).slice(0, 7));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    return months.map((month) => {
      const rental = paidBills.reduce((total, bill) => {
        if (!bill.paidAt || calendarDateKey(bill.paidAt).slice(0, 7) !== month) {
          return total;
        }

        return total.add(bill.amount).add(bill.lateFeeAmount);
      }, new Prisma.Decimal(0));

      const other = incomes.reduce((total, entry) => {
        if (calendarDateKey(entry.occurredAt).slice(0, 7) !== month) {
          return total;
        }

        return total.add(entry.amount);
      }, new Prisma.Decimal(0));

      const expense = expenses.reduce((total, entry) => {
        if (calendarDateKey(entry.occurredAt).slice(0, 7) !== month) {
          return total;
        }

        return total.add(entry.amount);
      }, new Prisma.Decimal(0));

      const income = rental.add(other);

      return {
        month,
        income,
        expense,
        net: income.sub(expense),
      };
    });
  }
}
