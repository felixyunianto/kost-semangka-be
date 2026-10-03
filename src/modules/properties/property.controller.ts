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

import { PropertyService } from "./property.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RoleGuard } from "../auth/guards/roles.guard";

import { CurrentUser } from "../users/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";

import { CreatePropertyDto } from "./dto/create-property.dto";
import { FilterPropertiesDto } from "./dto/filter-properties.dto";
import { UpdatePropertyDto } from "./dto/update-property.dto";

import type { TCurrentUser } from "../users/types/current-user.type";

@Controller("properties")
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(Role.OWNER)
export class PropertyController {
  constructor(private readonly propertyService: PropertyService) {}

  @Post()
  create(@CurrentUser() user: TCurrentUser, @Body() dto: CreatePropertyDto) {
    return this.propertyService.create(user.id, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: TCurrentUser,
    @Query() query: FilterPropertiesDto,
  ) {
    return this.propertyService.findAll(user.id, query);
  }

  @Get(":id")
  findOne(@CurrentUser() user: TCurrentUser, @Param("id") id: string) {
    return this.propertyService.findOne(user.id, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: TCurrentUser,
    @Param("id") id: string,
    @Body() dto: UpdatePropertyDto,
  ) {
    return this.propertyService.update(user.id, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: TCurrentUser, @Param("id") id: string) {
    return this.propertyService.remove(user.id, id);
  }
}
