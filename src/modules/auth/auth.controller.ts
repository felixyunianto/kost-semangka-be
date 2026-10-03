import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Headers,
  Req,
  Res,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { Request, Response } from "express";
import { Throttle } from "@nestjs/throttler";

import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { VerifyResetOtpDto } from "./dto/verify-reset-otp.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ResendResetOtpDto } from "./dto/resend-reset-otp.dto";
import { CurrentUser } from "../users/decorators/current-user.decorator";
import { TCurrentUser } from "../users/types/current-user.type";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: TCurrentUser) {
    return user;
  }

  @Get("validate")
  validateToken(@Headers("authorization") authorization?: string) {
    return this.authService.validateToken(authorization);
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Post("logout")
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Post("logout-all")
  @UseGuards(JwtAuthGuard)
  logoutAll(@Req() request: any) {
    return this.authService.logoutAll(request.user.id);
  }

  @Post("forgot-password")
  @Throttle({
    default: {
      limit: 3,
      ttl: 60_000,
    },
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post("forgot-password/verify")
  @Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  })
  verifyResetOtp(
    @Body() dto: VerifyResetOtpDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.verifyResetOtp(dto.challengeId, dto.otp, response);
  }

  @Post("reset-password")
  resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookieHeader = request.headers.cookie;

    const resetCookie = cookieHeader
      ?.split(";")
      .find((cookie) => cookie.trim().startsWith("password_reset_token="))
      ?.split("=")[1];

    return this.authService.resetPassword(
      dto.password,
      dto.confirmPassword,
      resetCookie,
      response,
    );
  }

  @Post("forgot-password/resend")
  @Throttle({
    default: {
      limit: 2,
      ttl: 60_000,
    },
  })
  resendResetOtp(@Body() dto: ResendResetOtpDto) {
    return this.authService.resendResetOtp(dto.challengeId);
  }
}
