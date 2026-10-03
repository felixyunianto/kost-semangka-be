import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import * as Midtrans from "midtrans-client";

import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RoleGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../users/decorators/current-user.decorator";
import { FilterPaymentsDto } from "./dto/filter-payments.dto";
import { PaymentsService } from "./payments.service";

import type { TCurrentUser } from "../users/types/current-user.type";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentService: PaymentsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(Role.OWNER)
  findAll(
    @CurrentUser() user: TCurrentUser,
    @Query() query: FilterPaymentsDto,
  ) {
    return this.paymentService.findAll(user.id, query);
  }

  @Post("bills/:billId")
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(Role.OWNER)
  sendInvoice(
    @CurrentUser() user: TCurrentUser,
    @Param("billId") billId: string,
  ) {
    return this.paymentService.sendInvoice(user.id, billId);
  }

  @Get("pay/:token")
  @Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  })
  async payPage(@Param("token") token: string, @Res() response: Response) {
    const html = await this.paymentService.getPublicPaymentPage(token);

    response.type("html").send(html);
  }

  @SkipThrottle()
  @Get("webhook")
  webhookCheck() {
    return {
      message: "Midtrans webhook endpoint is reachable",
    };
  }

  @SkipThrottle()
  @Post("webhook")
  async webhook(@Body() body: Midtrans.MidtransWebhookPayload) {
    await this.paymentService.handleWebhook(body);

    return {
      message: "Webhook processed successfully",
    };
  }

  @Get(":paymentId")
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(Role.OWNER)
  findOne(
    @CurrentUser() user: TCurrentUser,
    @Param("paymentId", ParseUUIDPipe) paymentId: string,
  ) {
    return this.paymentService.findOne(user.id, paymentId);
  }
}
