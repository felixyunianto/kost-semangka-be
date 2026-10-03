import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "src/prisma/prisma.service";
import { FilterDashboardDto } from "./dto/filter-dashboard.dto";

@Injectable()
export class DashboardService {
  constructor(private readonly prismaService: PrismaService) {}

  async getSummary(userId: string, query: FilterDashboardDto) {
    if (query.propertyId) {
      const property = await this.prismaService.property.findFirst({
        where: {
          id: query.propertyId,
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

    const propertyWhere: Prisma.PropertyWhereInput = {
      ownerId: userId,
      deletedAt: null,
      ...(query.propertyId && {
        id: query.propertyId,
      }),
    };

    const roomWhere: Prisma.RoomWhereInput = {
      deletedAt: null,
      property: propertyWhere,
    };

    const occupantWhere: Prisma.OccupantWhereInput = {
      deletedAt: null,
      isActive: true,
      room: roomWhere,
    };

    const billWhere: Prisma.BillWhereInput = {
      deletedAt: null,
      occupant: {
        room: {
          property: propertyWhere,
        },
      },
    };

    const monthStart = this.startOfMonth(new Date());
    const monthEnd = this.endOfMonth(new Date());

    const [
      propertyTotal,
      roomTotal,
      roomOccupied,
      occupantActive,
      unpaid,
      overdue,
      pending,
      paidThisMonth,
    ] = await Promise.all([
      this.prismaService.property.count({ where: propertyWhere }),
      this.prismaService.room.count({ where: roomWhere }),
      this.prismaService.room.count({
        where: {
          ...roomWhere,
          isAvailable: false,
        },
      }),
      this.prismaService.occupant.count({ where: occupantWhere }),
      this.aggregateBills({
        ...billWhere,
        status: "UNPAID",
      }),
      this.aggregateBills({
        ...billWhere,
        status: "OVERDUE",
      }),
      this.aggregateBills({
        ...billWhere,
        status: "PENDING",
      }),
      this.aggregateBills({
        ...billWhere,
        status: "PAID",
        paidAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      }),
    ]);

    const roomAvailable = roomTotal - roomOccupied;

    return {
      properties: {
        total: propertyTotal,
      },
      rooms: {
        total: roomTotal,
        occupied: roomOccupied,
        available: roomAvailable,
        occupancyRate: roomTotal
          ? Number(((roomOccupied / roomTotal) * 100).toFixed(1))
          : 0,
      },
      occupants: {
        active: occupantActive,
      },
      bills: {
        unpaid,
        overdue,
        pending,
        paidThisMonth,
      },
    };
  }

  private async aggregateBills(where: Prisma.BillWhereInput) {
    const result = await this.prismaService.bill.aggregate({
      where,
      _count: {
        _all: true,
      },
      _sum: {
        amount: true,
        lateFeeAmount: true,
      },
    });

    const amount = new Prisma.Decimal(result._sum.amount ?? 0);
    const lateFeeAmount = new Prisma.Decimal(result._sum.lateFeeAmount ?? 0);

    return {
      count: result._count._all,
      payableAmount: amount.add(lateFeeAmount),
    };
  }

  private startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  }

  private endOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  }
}
