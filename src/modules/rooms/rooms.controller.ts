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
import { CurrentUser } from "../users/decorators/current-user.decorator";
import { RoomsService } from "./rooms.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RoleGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Role } from "@prisma/client";
import { TCurrentUser } from "../users/types/current-user.type";
import { CreateRoomDto } from "./dto/create-room.dto";
import { CreateRoomInventoryDto } from "./dto/create-room-inventory.dto";
import { FilterRoomsDto } from "./dto/filter-rooms.dto";
import { UpdateRoomDto } from "./dto/update-room.dto";
import { UpdateRoomInventoryDto } from "./dto/update-room-inventory.dto";

@Controller("properties")
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(Role.OWNER)
export class RoomsController {
  constructor(private readonly roomService: RoomsService) {}

  @Post(":propertyId/rooms")
  create(
    @CurrentUser() user: TCurrentUser,
    @Param("propertyId") propertyId: string,
    @Body() dto: CreateRoomDto,
  ) {
    return this.roomService.create(user.id, propertyId, dto);
  }

  @Get(":propertyId/rooms")
  findAll(
    @CurrentUser() user: TCurrentUser,
    @Param("propertyId") propertyId: string,
    @Query() query: FilterRoomsDto,
  ) {
    return this.roomService.findAll(user.id, propertyId, query);
  }

  @Get(":propertyId/rooms/:roomId")
  findOne(
    @CurrentUser() user: TCurrentUser,
    @Param("propertyId") propertyId: string,
    @Param("roomId") roomId: string,
  ) {
    return this.roomService.findOne(user.id, propertyId, roomId);
  }

  @Patch(":propertyId/rooms/:roomId")
  update(
    @CurrentUser() user: TCurrentUser,
    @Param("propertyId") propertyId: string,
    @Param("roomId") roomId: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.roomService.update(user.id, propertyId, roomId, dto);
  }

  @Delete(":propertyId/rooms/:roomId")
  remove(
    @CurrentUser() user: TCurrentUser,
    @Param("propertyId") propertyId: string,
    @Param("roomId") roomId: string,
  ) {
    return this.roomService.remove(user.id, propertyId, roomId);
  }

  @Post(":propertyId/rooms/:roomId/inventories")
  createInventory(
    @CurrentUser() user: TCurrentUser,
    @Param("propertyId") propertyId: string,
    @Param("roomId") roomId: string,
    @Body() dto: CreateRoomInventoryDto,
  ) {
    return this.roomService.createInventory(user.id, propertyId, roomId, dto);
  }

  @Patch(":propertyId/rooms/:roomId/inventories/:inventoryId")
  updateInventory(
    @CurrentUser() user: TCurrentUser,
    @Param("propertyId") propertyId: string,
    @Param("roomId") roomId: string,
    @Param("inventoryId") inventoryId: string,
    @Body() dto: UpdateRoomInventoryDto,
  ) {
    return this.roomService.updateInventory(
      user.id,
      propertyId,
      roomId,
      inventoryId,
      dto,
    );
  }

  @Delete(":propertyId/rooms/:roomId/inventories/:inventoryId")
  removeInventory(
    @CurrentUser() user: TCurrentUser,
    @Param("propertyId") propertyId: string,
    @Param("roomId") roomId: string,
    @Param("inventoryId") inventoryId: string,
  ) {
    return this.roomService.removeInventory(
      user.id,
      propertyId,
      roomId,
      inventoryId,
    );
  }
}
