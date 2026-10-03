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
import { BillsService } from "../bills/bills.service";
import { MailService } from "../mail/mail.service";
import { CheckoutOccupantDto } from "./dto/checkout-occupant.dto";
import { CreateOccupantsDto } from "./dto/create-occupants.dto";
import { FilterOccupantsDto } from "./dto/filter-occupants.dto";
import { UpdateOccupantsDto } from "./dto/update-occupants.dto";
import { TestOccupantEmailDto } from "./dto/test-occupant-email.dto";

const occupantDetailInclude = {
  room: {
    select: {
      id: true,
      name: true,
      property: {
        select: { id: true, name: true },
      },
    },
  },
} satisfies Prisma.OccupantInclude;

@Injectable()
export class OccupantsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly billsService: BillsService,
    private readonly mailService: MailService,
  ) {}

  async findAll(userId: string, query: FilterOccupantsDto) {
    return this.listOccupants(userId, query);
  }

  async findByProperty(
    userId: string,
    propertyId: string,
    query: FilterOccupantsDto,
  ) {
    const property = await this.prismaService.property.findFirst({
      where: {
        id: propertyId,
        ownerId: userId,
        deletedAt: null,
      },
    });

    if (!property) {
      throw new NotFoundException("Property not found.");
    }

    return this.listOccupants(userId, query, { propertyId });
  }

  async findByRoom(
    userId: string,
    propertyId: string,
    roomId: string,
    query: FilterOccupantsDto,
  ) {
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
    });

    if (!room) {
      throw new NotFoundException("Room not found.");
    }

    return this.listOccupants(userId, query, { propertyId, roomId });
  }

  async findOne(userId: string, occupantId: string) {
    const occupant = await this.prismaService.occupant.findFirst({
      where: this.ownerOccupantWhere(userId, occupantId),
      include: occupantDetailInclude,
    });

    if (!occupant) {
      throw new NotFoundException("Occupant not found.");
    }

    return occupant;
  }

  async sendPreviewTestEmail(dto: TestOccupantEmailDto) {
    const result = await this.mailService.sendOccupantDeliveryTest(
      dto.email,
      dto.fullName?.trim() || "Calon penghuni",
      dto?.propertyName?.trim() || "Kost"
    );

    return {
      message: "Test email sent.",
      email: dto.email,
      deliveredTo: result.deliveredTo,
    };
  }

  async sendTestEmail(userId: string, occupantId: string) {
    const occupant = await this.findOne(userId, occupantId);

    if (!occupant.email) {
      throw new BadRequestException("Occupant email not found.");
    }

    const result = await this.mailService.sendOccupantDeliveryTest(
      occupant.email,
      occupant.fullName,
    );

    return {
      message: "Test email sent to occupant.",
      email: occupant.email,
      deliveredTo: result.deliveredTo,
    };
  }

  async create(
    userId: string,
    propertyId: string,
    roomId: string,
    dto: CreateOccupantsDto,
  ) {
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
    });

    if (!room) {
      throw new NotFoundException("Room not found.");
    }

    if (!room.isAvailable) {
      throw new ConflictException("Room is not available.");
    }

    const activeOccupant = await this.prismaService.occupant.findFirst({
      where: {
        roomId,
        isActive: true,
        deletedAt: null,
      },
    });

    if (activeOccupant) {
      throw new ConflictException("This room already has an active occupant.");
    }

    const occupant = await this.prismaService.$transaction(async (tx) => {
      const created = await tx.occupant.create({
        data: {
          roomId,
          fullName: dto.fullName,
          email: dto.email,
          phone: dto.phone,
          checkIn: new Date(dto.checkIn),
        },
        include: occupantDetailInclude,
      });

      await tx.room.update({
        where: {
          id: roomId,
        },
        data: {
          isAvailable: false,
        },
      });

      return created;
    });

    await this.billsService.createCurrentMonthlyBill(occupant.id);

    return occupant;
  }

  async checkout(
    userId: string,
    occupantId: string,
    dto: CheckoutOccupantDto,
  ) {
    const occupant = await this.prismaService.occupant.findFirst({
      where: this.ownerOccupantWhere(userId, occupantId),
    });

    if (!occupant) {
      throw new NotFoundException("Occupant not found.");
    }

    if (!occupant.isActive) {
      throw new ConflictException("This occupant has already checked out.");
    }

    const checkOut = dto?.checkOut ? new Date(dto.checkOut) : new Date();

    if (this.startOfDay(checkOut) < this.startOfDay(occupant.checkIn)) {
      throw new BadRequestException(
        "checkOut cannot be earlier than checkIn.",
      );
    }

    return this.prismaService.$transaction(async (tx) => {
      const updated = await tx.occupant.update({
        where: {
          id: occupantId,
        },
        data: {
          isActive: false,
          checkOut,
        },
        include: occupantDetailInclude,
      });

      await tx.room.update({
        where: {
          id: occupant.roomId,
        },
        data: {
          isAvailable: true,
        },
      });

      return updated;
    });
  }

  async update(
    userId: string,
    propertyId: string,
    roomId: string,
    occupantId: string,
    dto: UpdateOccupantsDto,
  ) {
    const occupant = await this.prismaService.occupant.findFirst({
      where: {
        id: occupantId,
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

    return this.prismaService.occupant.update({
      where: {
        id: occupantId,
      },
      data: {
        ...(dto.fullName !== undefined && {
          fullName: dto.fullName,
        }),

        ...(dto.email !== undefined && {
          email: dto.email,
        }),

        ...(dto.phone !== undefined && {
          phone: dto.phone,
        }),

        ...(dto.checkIn !== undefined && {
          checkIn: new Date(dto.checkIn),
        }),

        ...(dto.checkOut !== undefined && {
          checkOut: new Date(dto.checkOut),
        }),
      },
    });
  }

  async remove(
    userId: string,
    propertyId: string,
    roomId: string,
    occupantId: string,
  ) {
    const occupant = await this.prismaService.occupant.findFirst({
      where: {
        id: occupantId,
        roomId,
        deletedAt: null,
        room: {
          propertyId,
          deletedAt: null,
          property: {
            ownerId: userId,
            deletedAt: null,
          },
        },
      },
    });

    if (!occupant) {
      throw new NotFoundException("Occipant not found.");
    }

    await this.prismaService.$transaction(async (tx) => {
      await tx.occupant.update({
        where: {
          id: occupantId,
        },
        data: {
          isActive: false,
          deletedAt: new Date(),
        },
      });

      await tx.room.update({
        where: {
          id: roomId,
        },
        data: {
          isAvailable: true,
        },
      });
    });

    return {
      message: "Occupant deleted successfully.",
    };
  }

  private ownerOccupantWhere(
    userId: string,
    occupantId: string,
  ): Prisma.OccupantWhereInput {
    return {
      id: occupantId,
      deletedAt: null,
      room: {
        deletedAt: null,
        property: {
          ownerId: userId,
          deletedAt: null,
        },
      },
    };
  }

  private async listOccupants(
    userId: string,
    query: FilterOccupantsDto,
    scope?: { propertyId?: string; roomId?: string },
  ) {
    this.assertCheckInRange(query.checkInFrom, query.checkInTo);

    const { page, limit, skip, take } = getPaginationParams(query);
    const where = this.buildFindAllWhere(userId, query, scope);

    const [occupants, total] = await this.prismaService.$transaction([
      this.prismaService.occupant.findMany({
        where,
        include: occupantDetailInclude,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take,
      }),
      this.prismaService.occupant.count({ where }),
    ]);

    return paginate(occupants, page, limit, total);
  }

  private buildFindAllWhere(
    userId: string,
    query: FilterOccupantsDto,
    scope?: { propertyId?: string; roomId?: string },
  ): Prisma.OccupantWhereInput {
    const name = normalizeNameQuery(query.name);
    const checkIn = this.buildCheckInRange(query.checkInFrom, query.checkInTo);
    const propertyId = scope?.propertyId ?? query.propertyId;

    return {
      deletedAt: null,
      ...(query.isActive !== undefined && {
        isActive: query.isActive,
      }),
      ...(name && {
        fullName: {
          contains: name,
          mode: "insensitive",
        },
      }),
      ...(checkIn && { checkIn }),
      ...(scope?.roomId && {
        roomId: scope.roomId,
      }),
      room: {
        deletedAt: null,
        ...(propertyId && {
          propertyId,
        }),
        property: {
          ownerId: userId,
          deletedAt: null,
        },
      },
    };
  }

  private buildCheckInRange(checkInFrom?: string, checkInTo?: string) {
    if (!checkInFrom && !checkInTo) {
      return undefined;
    }

    return {
      ...(checkInFrom && { gte: this.startOfDay(new Date(checkInFrom)) }),
      ...(checkInTo && { lte: this.endOfDay(new Date(checkInTo)) }),
    };
  }

  private assertCheckInRange(checkInFrom?: string, checkInTo?: string) {
    if (!checkInFrom || !checkInTo) {
      return;
    }

    if (new Date(checkInFrom) > new Date(checkInTo)) {
      throw new BadRequestException(
        "checkInFrom cannot be greater than checkInTo.",
      );
    }
  }

  private startOfDay(date: Date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private endOfDay(date: Date) {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }
}
