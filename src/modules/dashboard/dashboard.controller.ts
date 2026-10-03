import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";

import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RoleGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../users/decorators/current-user.decorator";
import { DashboardService } from "./dashboard.service";
import { FilterDashboardDto } from "./dto/filter-dashboard.dto";

import type { TCurrentUser } from "../users/types/current-user.type";

@Controller("dashboard")
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(Role.OWNER)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getSummary(
    @CurrentUser() user: TCurrentUser,
    @Query() query: FilterDashboardDto,
  ) {
    return this.dashboardService.getSummary(user.id, query);
  }
}
