import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { BillStatus, BillType, InventoryStatus, Prisma } from "@prisma/client";

import { normalizeNameQuery } from "src/common/utils/normalize-name";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateRoomDto } from "./dto/create-room.dto";
import { CreateRoomInventoryDto } from "./dto/create-room-inventory.dto";
import { FilterRoomsDto } from "./dto/filter-rooms.dto";
import { UpdateRoomDto } from "./dto/update-room.dto";
import { UpdateRoomInventoryDto } from "./dto/update-room-inventory.dto";

const inventoryInclude = {
  inventories: {
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: "asc" as const,
    },
    select: {
      id: true,
      name: true,
      condition: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.RoomInclude;

const OUTSTANDING_RENT_STATUSES: BillStatus[] = [
  BillStatus.OVERDUE,
  BillStatus.UNPAID,
  BillStatus.PENDING,
];

const activeOccupantInclude = {
  occupants: {
    where: {
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      fullName: true,
      // Hanya tagihan sewa yang belum lunas (tanpa PAID & CANCELLED)
      bills: {
        where: {
          type: BillType.RENT,
          status: { in: OUTSTANDING_RENT_STATUSES },
          deletedAt: null,
        },
        orderBy: {
          dueDate: "asc" as const,
        },
        select: {
          id: true,
          invoiceNumber: true,
          type: true,
          amount: true,
          lateFeeAmount: true,
          status: true,
          periodStart: true,
          periodEnd: true,
          dueDate: true,
        },
      },
      // Total tagihan sewa (selain CANCELLED), untuk membedakan
      // "sudah lunas semua" dengan "belum pernah ditagih"
      _count: {
        select: {
          bills: {
            where: {
              type: BillType.RENT,
              status: { not: BillStatus.CANCELLED },
              deletedAt: null,
            },
          },
        },
      },
    },
    take: 1,
  },
} satisfies Prisma.RoomInclude;

const roomDetailInclude = {
  ...activeOccupantInclude,
  ...inventoryInclude,
} satisfies Prisma.RoomInclude;

@Injectable()
export class RoomsService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(userId: string, propertyId: string, dto: CreateRoomDto) {
    const property = await this.prismaService.property.findFirst({
      where: {
        ownerId: userId,
        id: propertyId,
        deletedAt: null,
      },
    });

    if (!property) {
      throw new NotFoundException("Property not found.");
    }

    const { inventories, ...roomData } = dto;

    const room = await this.prismaService.room.create({
      data: {
        propertyId,
        name: roomData.name,
        description: roomData.description,
        price: roomData.price,
        type: roomData.type,
        length: roomData.length,
        width: roomData.width,
        ...(inventories?.length && {
          inventories: {
            create: inventories.map((item) => this.toInventoryCreateData(item)),
          },
        }),
      },
      include: roomDetailInclude,
    });

    return this.toRoomResponse(room);
  }

  async findAll(userId: string, propertyId: string, query: FilterRoomsDto) {
    const property = await this.prismaService.property.findFirst({
      where: {
        ownerId: userId,
        id: propertyId,
        deletedAt: null,
      },
    });

    if (!property) {
      throw new NotFoundException("Propery not found");
    }

    this.assertRange(query.minPrice, query.maxPrice, "price");
    this.assertRange(query.minLength, query.maxLength, "length");
    this.assertRange(query.minWidth, query.maxWidth, "width");

    const where = this.buildFindAllWhere(propertyId, query);

    const rooms = await this.prismaService.room.findMany({
      where,
      include: roomDetailInclude,
      orderBy: {
        name: "asc",
      },
    });

    return rooms.map((room) => this.toRoomResponse(room));
  }

  async findOne(userId: string, propertyId: string, roomId: string) {
    const room = await this.findOwnedRoom(userId, propertyId, roomId);

    return this.toRoomResponse(room);
  }

  async update(
    userId: string,
    propertyId: string,
    roomId: string,
    dto: UpdateRoomDto,
  ) {
    await this.findOwnedRoom(userId, propertyId, roomId);

    const { inventories, ...roomData } = dto;

    const updatedRoom = await this.prismaService.$transaction(async (tx) => {
      if (inventories) {
        await tx.roomInventory.updateMany({
          where: {
            roomId,
            deletedAt: null,
          },
          data: {
            deletedAt: new Date(),
          },
        });

        if (inventories.length) {
          await tx.roomInventory.createMany({
            data: inventories.map((item) => ({
              roomId,
              ...this.toInventoryCreateData(item),
            })),
          });
        }
      }

      return tx.room.update({
        where: {
          id: roomId,
        },
        data: roomData,
        include: roomDetailInclude,
      });
    });

    return this.toRoomResponse(updatedRoom);
  }

  async remove(userId: string, propertyId: string, roomId: string) {
    await this.findOwnedRoom(userId, propertyId, roomId);

    await this.prismaService.room.update({
      where: {
        id: roomId,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return {
      message: "Room deleted successfully",
    };
  }

  async createInventory(
    userId: string,
    propertyId: string,
    roomId: string,
    dto: CreateRoomInventoryDto,
  ) {
    await this.findOwnedRoom(userId, propertyId, roomId);

    await this.prismaService.roomInventory.create({
      data: {
        roomId,
        ...this.toInventoryCreateData(dto),
      },
    });

    return this.findOne(userId, propertyId, roomId);
  }

  async updateInventory(
    userId: string,
    propertyId: string,
    roomId: string,
    inventoryId: string,
    dto: UpdateRoomInventoryDto,
  ) {
    await this.findOwnedRoom(userId, propertyId, roomId);

    const inventory = await this.prismaService.roomInventory.findFirst({
      where: {
        id: inventoryId,
        roomId,
        deletedAt: null,
      },
    });

    if (!inventory) {
      throw new NotFoundException("Inventory not found.");
    }

    await this.prismaService.roomInventory.update({
      where: {
        id: inventoryId,
      },
      data: dto,
    });

    return this.findOne(userId, propertyId, roomId);
  }

  async removeInventory(
    userId: string,
    propertyId: string,
    roomId: string,
    inventoryId: string,
  ) {
    await this.findOwnedRoom(userId, propertyId, roomId);

    const inventory = await this.prismaService.roomInventory.findFirst({
      where: {
        id: inventoryId,
        roomId,
        deletedAt: null,
      },
    });

    if (!inventory) {
      throw new NotFoundException("Inventory not found.");
    }

    await this.prismaService.roomInventory.update({
      where: {
        id: inventoryId,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return this.findOne(userId, propertyId, roomId);
  }

  private async findOwnedRoom(userId: string, propertyId: string, roomId: string) {
    const room = await this.prismaService.room.findFirst({
      where: {
        id: roomId,
        propertyId,
        deletedAt: null,
        property: {
          ownerId: userId,
          deletedAt: null,
        },
      },
      include: roomDetailInclude,
    });

    if (!room) {
      throw new NotFoundException("Room not found.");
    }

    return room;
  }

  private buildFindAllWhere(
    propertyId: string,
    query: FilterRoomsDto,
  ): Prisma.RoomWhereInput {
    const name = normalizeNameQuery(query.name);
    const occupantName = normalizeNameQuery(query.occupantName);
    const inventoryNames = this.normalizeInventoryNames(query.inventories);

    return {
      propertyId,
      deletedAt: null,
      ...(name && {
        name: {
          contains: name,
          mode: "insensitive",
        },
      }),
      ...(occupantName && {
        occupants: {
          some: {
            isActive: true,
            deletedAt: null,
            fullName: {
              contains: occupantName,
              mode: "insensitive",
            },
          },
        },
      }),
      ...this.buildDecimalRange("price", query.minPrice, query.maxPrice),
      ...(query.isAvailable !== undefined && {
        isAvailable: query.isAvailable,
      }),
      ...this.buildDecimalRange("length", query.minLength, query.maxLength),
      ...this.buildDecimalRange("width", query.minWidth, query.maxWidth),
      ...(inventoryNames.length && {
        AND: inventoryNames.map((inventoryName) => ({
          inventories: {
            some: {
              deletedAt: null,
              name: {
                equals: inventoryName,
                mode: "insensitive" as const,
              },
            },
          },
        })),
      }),
      ...((query.inventoryStatus || query.inventoryCondition) && {
        inventories: {
          some: {
            deletedAt: null,
            ...(query.inventoryStatus && { status: query.inventoryStatus }),
            ...(query.inventoryCondition && {
              condition: query.inventoryCondition,
            }),
          },
        },
      }),
    };
  }

  private normalizeInventoryNames(inventories?: string[]) {
    return [
      ...new Set(
        (inventories ?? [])
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
  }

  private toInventoryCreateData(dto: CreateRoomInventoryDto) {
    return {
      name: dto.name.trim(),
      condition: dto.condition,
      status: dto.status ?? InventoryStatus.FUNCTIONAL,
    };
  }

  private buildDecimalRange(
    field: "price" | "length" | "width",
    min?: number,
    max?: number,
  ): Prisma.RoomWhereInput {
    if (min === undefined && max === undefined) {
      return {};
    }

    return {
      [field]: {
        ...(min !== undefined && { gte: min }),
        ...(max !== undefined && { lte: max }),
      },
    };
  }

  private assertRange(min: number | undefined, max: number | undefined, field: string) {
    if (min !== undefined && max !== undefined && min > max) {
      throw new BadRequestException(
        `min ${field} cannot be greater than max ${field}.`,
      );
    }
  }

  private toRoomResponse(
    room: Prisma.RoomGetPayload<{ include: typeof roomDetailInclude }>,
  ) {
    const activeOccupant = room.occupants[0] ?? null;
    const { occupants: _occupants, ...roomData } = room;

    if (!activeOccupant) {
      return {
        ...roomData,
        occupant: null,
        occupantName: null,
        rentStatus: null,
        outstandingRentBills: [],
      };
    }

    const { bills, _count, ...occupant } = activeOccupant;

    return {
      ...roomData,
      occupant,
      occupantName: occupant.fullName,
      rentStatus: this.resolveRentStatus(bills, _count.bills),
      outstandingRentBills: bills,
    };
  }

  // Status sewa kamar: OVERDUE > UNPAID > PENDING > PAID.
  // null = belum ada tagihan sewa sama sekali.
  private resolveRentStatus(
    outstandingBills: { status: BillStatus }[],
    totalRentBills: number,
  ): BillStatus | null {
    for (const status of OUTSTANDING_RENT_STATUSES) {
      if (outstandingBills.some((bill) => bill.status === status)) {
        return status;
      }
    }

    return totalRentBills > 0 ? BillStatus.PAID : null;
  }
}
