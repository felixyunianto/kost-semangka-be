import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RoleGuard } from "../auth/guards/roles.guard";

import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../users/decorators/current-user.decorator";

import { OccupantsService } from "./occupants.service";

import { CheckoutOccupantDto } from "./dto/checkout-occupant.dto";
import { CreateOccupantsDto } from "./dto/create-occupants.dto";
import { FilterOccupantsDto } from "./dto/filter-occupants.dto";
import { TestOccupantEmailDto } from "./dto/test-occupant-email.dto";

import type { TCurrentUser } from "../users/types/current-user.type";
import { UpdateOccupantsDto } from "./dto/update-occupants.dto";

@Controller()
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(Role.OWNER)
export class OccupantsController {
  constructor(private readonly occupantService: OccupantsService) {}

  @Get("occupants")
  findAll(
    @CurrentUser() user: TCurrentUser,
    @Query() query: FilterOccupantsDto,
  ) {
    return this.occupantService.findAll(user.id, query);
  }

  @Get("properties/:propertyId/occupants")
  findByProperty(
    @CurrentUser() user: TCurrentUser,
    @Param("propertyId") propertyId: string,
    @Query() query: FilterOccupantsDto,
  ) {
    return this.occupantService.findByProperty(user.id, propertyId, query);
  }

  @Get("properties/:propertyId/rooms/:roomId/occupants")
  findByRoom(
    @CurrentUser() user: TCurrentUser,
    @Param("propertyId") propertyId: string,
    @Param("roomId") roomId: string,
    @Query() query: FilterOccupantsDto,
  ) {
    return this.occupantService.findByRoom(user.id, propertyId, roomId, query);
  }

  @Post("occupants/test-email")
  sendPreviewTestEmail(@Body() dto: TestOccupantEmailDto) {
    return this.occupantService.sendPreviewTestEmail(dto);
  }

  @Get("occupants/:occupantId")
  findOne(
    @CurrentUser() user: TCurrentUser,
    @Param("occupantId") occupantId: string,
  ) {
    return this.occupantService.findOne(user.id, occupantId);
  }

  @Post("occupants/:occupantId/test-email")
  sendTestEmail(
    @CurrentUser() user: TCurrentUser,
    @Param("occupantId") occupantId: string,
  ) {
    return this.occupantService.sendTestEmail(user.id, occupantId);
  }

  @Post("occupants/:occupantId/checkout")
  checkout(
    @CurrentUser() user: TCurrentUser,
    @Param("occupantId") occupantId: string,
    @Body() dto: CheckoutOccupantDto,
  ) {
    return this.occupantService.checkout(user.id, occupantId, dto);
  }

  @Post("properties/:propertyId/rooms/:roomId/occupants")
  create(
    @CurrentUser() user: TCurrentUser,
    @Param("propertyId") propertyId: string,
    @Param("roomId") roomId: string,
    @Body() dto: CreateOccupantsDto,
  ) {
    return this.occupantService.create(user.id, propertyId, roomId, dto);
  }

  @Patch("properties/:propertyId/rooms/:roomId/occupants/:occupantId")
  update(
    @CurrentUser() user: TCurrentUser,
    @Param("propertyId") propertyId: string,
    @Param("roomId") roomId: string,
    @Param("occupantId") occupantId: string,
    @Body() dto: UpdateOccupantsDto,
  ) {
    return this.occupantService.update(
      user.id,
      propertyId,
      roomId,
      occupantId,
      dto,
    );
  }

  @Delete("properties/:propertyId/rooms/:roomId/occupants/:occupantId")
  remove(
    @CurrentUser() user: TCurrentUser,
    @Param("propertyId") propertyId: string,
    @Param("roomId") roomId: string,
    @Param("occupantId") occupantId: string,
  ) {
    return this.occupantService.remove(user.id, propertyId, roomId, occupantId);
  }
}
