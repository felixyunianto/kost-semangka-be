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

import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RoleGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../users/decorators/current-user.decorator";
import { CreateFinanceEntryDto } from "./dto/create-finance-entry.dto";
import { FilterFinanceEntriesDto } from "./dto/filter-finance-entries.dto";
import { FilterFinanceReportDto } from "./dto/filter-finance-report.dto";
import { UpdateFinanceEntryDto } from "./dto/update-finance-entry.dto";
import { FINANCE_CATEGORIES } from "./finance-categories";
import { FinancesService } from "./finances.service";

import type { TCurrentUser } from "../users/types/current-user.type";

@Controller("finances")
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(Role.OWNER)
export class FinancesController {
  constructor(private readonly financesService: FinancesService) {}

  @Get("reports")
  getReport(
    @CurrentUser() user: TCurrentUser,
    @Query() query: FilterFinanceReportDto,
  ) {
    return this.financesService.getReport(user.id, query);
  }

  @Get("categories")
  getCategories() {
    return FINANCE_CATEGORIES;
  }

  @Get("incomes")
  findIncomes(
    @CurrentUser() user: TCurrentUser,
    @Query() query: FilterFinanceEntriesDto,
  ) {
    return this.financesService.findIncomes(user.id, query);
  }

  @Get("incomes/:entryId")
  findIncome(
    @CurrentUser() user: TCurrentUser,
    @Param("entryId") entryId: string,
  ) {
    return this.financesService.findIncome(user.id, entryId);
  }

  @Post("incomes")
  createIncome(
    @CurrentUser() user: TCurrentUser,
    @Body() dto: CreateFinanceEntryDto,
  ) {
    return this.financesService.createIncome(user.id, dto);
  }

  @Patch("incomes/:entryId")
  updateIncome(
    @CurrentUser() user: TCurrentUser,
    @Param("entryId") entryId: string,
    @Body() dto: UpdateFinanceEntryDto,
  ) {
    return this.financesService.updateIncome(user.id, entryId, dto);
  }

  @Delete("incomes/:entryId")
  removeIncome(
    @CurrentUser() user: TCurrentUser,
    @Param("entryId") entryId: string,
  ) {
    return this.financesService.removeIncome(user.id, entryId);
  }

  @Get("expenses")
  findExpenses(
    @CurrentUser() user: TCurrentUser,
    @Query() query: FilterFinanceEntriesDto,
  ) {
    return this.financesService.findExpenses(user.id, query);
  }

  @Get("expenses/:entryId")
  findExpense(
    @CurrentUser() user: TCurrentUser,
    @Param("entryId") entryId: string,
  ) {
    return this.financesService.findExpense(user.id, entryId);
  }

  @Post("expenses")
  createExpense(
    @CurrentUser() user: TCurrentUser,
    @Body() dto: CreateFinanceEntryDto,
  ) {
    return this.financesService.createExpense(user.id, dto);
  }

  @Patch("expenses/:entryId")
  updateExpense(
    @CurrentUser() user: TCurrentUser,
    @Param("entryId") entryId: string,
    @Body() dto: UpdateFinanceEntryDto,
  ) {
    return this.financesService.updateExpense(user.id, entryId, dto);
  }

  @Delete("expenses/:entryId")
  removeExpense(
    @CurrentUser() user: TCurrentUser,
    @Param("entryId") entryId: string,
  ) {
    return this.financesService.removeExpense(user.id, entryId);
  }
}
