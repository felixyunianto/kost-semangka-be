import {
  Body,
  Controller,
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
import { BillsService } from "./bills.service";
import { CurrentUser } from "../users/decorators/current-user.decorator";
import { CreateBillDto } from "./dto/create-bill.dto";
import { FilterBillsDto } from "./dto/filter-bills.dto";
import { UpdateBillDto } from "./dto/update-bill.dto";
import { BillScheduller } from "./bill.scheduler";

import type { TCurrentUser } from "../users/types/current-user.type";

@Controller("bills")
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(Role.OWNER)
export class BillsController {
  constructor(
    private readonly billService: BillsService,
    private readonly billScheduler: BillScheduller,
  ) {}

  @Get()
  findAll(
    @CurrentUser() user: TCurrentUser,
    @Query() query: FilterBillsDto,
  ) {
    return this.billService.findAll(user.id, query);
  }

  @Get(":billId")
  findOne(
    @CurrentUser() user: TCurrentUser,
    @Param("billId") billId: string,
  ) {
    return this.billService.findOne(user.id, billId);
  }

  @Patch(":billId/cancel")
  cancel(
    @CurrentUser() user: TCurrentUser,
    @Param("billId") billId: string,
  ) {
    return this.billService.cancel(user.id, billId);
  }

  @Patch(":billId/pay-cash")
  markPaidCash(
    @CurrentUser() user: TCurrentUser,
    @Param("billId") billId: string,
  ) {
    return this.billService.markPaidCash(user.id, billId);
  }

  @Patch(":billId")
  update(
    @CurrentUser() user: TCurrentUser,
    @Param("billId") billId: string,
    @Body() dto: UpdateBillDto,
  ) {
    return this.billService.updateManual(user.id, billId, dto);
  }

  @Post()
  create(@CurrentUser() user: TCurrentUser, @Body() dto: CreateBillDto) {
    return this.billService.createManual(user.id, dto);
  }

  @Post("test/generate-monthly")
  @UseGuards(JwtAuthGuard)
  generateMonthlyBills() {
    return this.billScheduler.generateMonthlyBills();
  }

  @Post("generate-missing")
  @UseGuards(JwtAuthGuard)
  generateMissingBills() {
    return this.billService.generateMissingMonthlyBills();
  }

  @Post("process-overdue")
  @UseGuards(JwtAuthGuard)
  processOverdueBills() {
    return this.billService.processOverdueBills();
  }

  @Post("send-reminders")
  sendReminders() {
    return this.billService.sendReminders();
  }
}
