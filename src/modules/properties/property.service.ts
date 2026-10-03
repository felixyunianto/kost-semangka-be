import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { normalizeNameQuery } from "src/common/utils/normalize-name";
import { getPaginationParams, paginate } from "src/common/utils/pagination";
import { PrismaService } from "src/prisma/prisma.service";
import { CreatePropertyDto } from "./dto/create-property.dto";
import { FilterPropertiesDto } from "./dto/filter-properties.dto";
import { UpdatePropertyDto } from "./dto/update-property.dto";

const roomOccupantInclude = {
  occupants: {
    where: {
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      fullName: true,
    },
    take: 1,
  },
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

const propertyInclude = {
  setting: true,
  rooms: {
    where: {
      deletedAt: null,
    },
    include: roomOccupantInclude,
  },
} satisfies Prisma.PropertyInclude;

type PropertyLateFeeSetting = {
  lateFeeType: "FIXED" | "PERCENTAGE";
  lateFeeAmount: Prisma.Decimal;
};

type PropertyWithRooms = Prisma.PropertyGetPayload<{
  include: typeof propertyInclude;
}>;

@Injectable()
export class PropertyService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(ownerId: string, dto: CreatePropertyDto) {
    this.assertLateFeeAmount(dto.lateFeeType, dto.lateFeeAmount);

    const property = await this.prismaService.property.create({
      data: {
        owner: {
          connect: { id: ownerId },
        },
        name: dto.name,
        description: dto.description,
        address: dto.address,
        phone: dto.phone,
        setting: {
          create: {
            lateFeeEnabled: dto.lateFeeEnabled ?? false,
            lateFeeType: dto.lateFeeType ?? "FIXED",
            lateFeeAmount: dto.lateFeeAmount ?? 0,
            lateFeeGraceDays: dto.lateFeeGraceDays ?? 0,
          },
        },
      },
      include: propertyInclude,
    });

    return this.toPropertyResponse(property);
  }

  async findAll(ownerId: string, query: FilterPropertiesDto) {
    const { page, limit, skip, take } = getPaginationParams(query);
    const where = this.buildFindAllWhere(ownerId, query);

    const [properties, total] = await this.prismaService.$transaction([
      this.prismaService.property.findMany({
        where,
        include: propertyInclude,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take,
      }),
      this.prismaService.property.count({ where }),
    ]);

    return paginate(
      properties.map((property) => this.toPropertyResponse(property)),
      page,
      limit,
      total,
    );
  }

  async findOne(ownerId: string, propertyId: string) {
    const property = await this.prismaService.property.findFirst({
      where: {
        id: propertyId,
        ownerId,
        deletedAt: null,
      },
      include: propertyInclude,
    });

    if (!property) {
      throw new NotFoundException("Property not found.");
    }

    return this.toPropertyResponse(property);
  }

  async update(ownerId: string, propertyId: string, dto: UpdatePropertyDto) {
    const property = await this.prismaService.property.findFirst({
      where: {
        id: propertyId,
        ownerId,
        deletedAt: null,
      },
    });

    if (!property) {
      throw new NotFoundException("Property not found.");
    }

    const currentSetting = await this.findLateFeeSetting(propertyId);

    this.assertLateFeeAmount(
      dto.lateFeeType ?? currentSetting?.lateFeeType,
      dto.lateFeeAmount ??
        (currentSetting ? Number(currentSetting.lateFeeAmount) : undefined),
    );

    const { propertyData, settingCreate, settingUpdate, hasSettingUpdate } =
      this.splitPropertyDto(dto);

    const updatedProperty = await this.prismaService.property.update({
      where: { id: propertyId },
      data: {
        ...propertyData,
        ...(hasSettingUpdate && {
          setting: {
            upsert: {
              create: settingCreate,
              update: settingUpdate,
            },
          },
        }),
      },
      include: propertyInclude,
    });

    return this.toPropertyResponse(updatedProperty);
  }

  async remove(ownerId: string, propertyId: string) {
    const property = await this.prismaService.property.findFirst({
      where: {
        id: propertyId,
        ownerId,
        deletedAt: null,
      },
    });

    if (!property) {
      throw new NotFoundException("Property not found.");
    }

    await this.prismaService.property.update({
      where: { id: propertyId },
      data: {
        deletedAt: new Date(),
      },
    });

    return {
      message: "Property deleted successfully",
    };
  }

  private buildFindAllWhere(
    ownerId: string,
    query: FilterPropertiesDto,
  ): Prisma.PropertyWhereInput {
    const name = normalizeNameQuery(query.name);

    return {
      ownerId,
      deletedAt: null,
      ...(name && {
        name: {
          contains: name,
          mode: "insensitive",
        },
      }),
      ...(query.lateFeeEnabled !== undefined && {
        setting: {
          lateFeeEnabled: query.lateFeeEnabled,
        },
      }),
    };
  }

  private splitPropertyDto(dto: UpdatePropertyDto) {
    const {
      lateFeeEnabled,
      lateFeeType,
      lateFeeAmount,
      lateFeeGraceDays,
      ...propertyData
    } = dto;

    const settingUpdate = {
      ...(lateFeeEnabled !== undefined && { lateFeeEnabled }),
      ...(lateFeeType !== undefined && { lateFeeType }),
      ...(lateFeeAmount !== undefined && { lateFeeAmount }),
      ...(lateFeeGraceDays !== undefined && { lateFeeGraceDays }),
    };

    return {
      propertyData,
      settingCreate: {
        lateFeeEnabled: lateFeeEnabled ?? false,
        lateFeeType: lateFeeType ?? "FIXED",
        lateFeeAmount: lateFeeAmount ?? 0,
        lateFeeGraceDays: lateFeeGraceDays ?? 0,
      },
      settingUpdate,
      hasSettingUpdate: Object.keys(settingUpdate).length > 0,
    };
  }

  private async findLateFeeSetting(propertyId: string) {
    const settings = await this.prismaService.$queryRaw<PropertyLateFeeSetting[]>`
      SELECT
        late_fee_type AS "lateFeeType",
        late_fee_amount AS "lateFeeAmount"
      FROM property_settings
      WHERE "propertyId" = ${propertyId}::uuid
      LIMIT 1
    `;

    return settings[0] ?? null;
  }

  private toPropertyResponse(property: PropertyWithRooms) {
    return {
      id: property.id,
      ownerId: property.ownerId,
      name: property.name,
      description: property.description,
      address: property.address,
      phone: property.phone,
      createdAt: property.createdAt,
      updatedAt: property.updatedAt,
      setting: property.setting
        ? {
            lateFeeEnabled: property.setting.lateFeeEnabled,
            lateFeeType: property.setting.lateFeeType,
            lateFeeAmount: Number(property.setting.lateFeeAmount),
            lateFeeGraceDays: property.setting.lateFeeGraceDays,
          }
        : null,
      rooms: property.rooms.map((room) => {
        const occupant = room.occupants[0] ?? null;
        const { occupants: _occupants, ...roomData } = room;

        return {
          ...roomData,
          occupant,
          occupantName: occupant?.fullName ?? null,
        };
      }),
    };
  }

  private assertLateFeeAmount(
    lateFeeType?: "FIXED" | "PERCENTAGE",
    lateFeeAmount?: number,
  ) {
    if (
      lateFeeType === "PERCENTAGE" &&
      lateFeeAmount !== undefined &&
      lateFeeAmount > 100
    ) {
      throw new BadRequestException(
        "Late fee percentage cannot be greater than 100.",
      );
    }
  }
}
