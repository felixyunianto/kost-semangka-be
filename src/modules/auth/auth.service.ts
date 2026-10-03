import * as argon2 from "argon2";
import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Response } from "express";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { JwtService } from "@nestjs/jwt";

import { LoginDto } from "./dto/login.dto";

import { PrismaService } from "src/prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { MailService } from "../mail/mail.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prismaService: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.userService.findByEmail(loginDto.email);

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Incorrect email or password");
    }

    const isValidPassword = await argon2.verify(
      user.password,
      loginDto.password,
    );

    if (!isValidPassword) {
      throw new UnauthorizedException("Incorrect email or password");
    }

    const sessionId = randomUUID();

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        sessionId,
        type: "refresh",
      },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: "7d",
      },
    );

    const refreshTokenHash = await argon2.hash(refreshToken);

    await this.prismaService.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshToken: refreshTokenHash,
        expiredAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    };
  }

  async validateToken(authorization?: string) {
    const token = this.extractBearerToken(authorization);

    if (!token) {
      return {
        valid: false,
        user: null,
      };
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        email: string;
        role: string;
      }>(token);

      const user = await this.userService.findById(payload.sub);

      if (!user || !user.isActive) {
        return {
          valid: false,
          user: null,
        };
      }

      return {
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
      };
    } catch {
      return {
        valid: false,
        user: null,
      };
    }
  }

  private extractBearerToken(authorization?: string) {
    if (!authorization) {
      return null;
    }

    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
      return null;
    }

    return token;
  }

  async refreshToken(refreshToken: string) {
    let payload: {
      sub: string;
      sessionId: string;
      type: string;
    };

    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token.");
    }

    if (payload.type !== "refresh") {
      throw new UnauthorizedException("Invalid refresh token.");
    }

    const session = await this.prismaService.session.findUnique({
      where: {
        id: payload.sessionId,
      },
    });

    if (!session) {
      throw new UnauthorizedException("Invalid refresh token.");
    }

    if (session.expiredAt < new Date()) {
      throw new UnauthorizedException("Refresh token has expired.");
    }

    const isValid = await argon2.verify(session.refreshToken, refreshToken);

    if (!isValid) {
      throw new UnauthorizedException("Invalid refresh token.");
    }

    const user = await this.userService.findById(session.userId);

    if (!user || !user.isActive) {
      throw new UnauthorizedException("User is inactive or no longer exists.");
    }

    const newAccessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const newRefreshToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        sessionId: session.id,
        type: "refresh",
      },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: "7d",
      },
    );

    const newRefreshTokenHash = await argon2.hash(newRefreshToken);

    await this.prismaService.session.update({
      where: {
        id: session.id,
      },
      data: {
        refreshToken: newRefreshTokenHash,
        expiredAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshToken: string) {
    let payload: {
      sessionId: string;
      type: string;
    };

    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch (error) {
      throw new UnauthorizedException("Invalid refresh token.");
    }

    if (payload.type !== "refresh") {
      throw new UnauthorizedException("Invalid refresh token.");
    }

    const session = await this.prismaService.session.findUnique({
      where: {
        id: payload.sessionId,
      },
    });

    if (!session) {
      return {
        message: "Logout successful",
      };
    }

    const isValid = await argon2.verify(session.refreshToken, refreshToken);

    if (!isValid) {
      throw new UnauthorizedException("Invalid refresh token.");
    }

    await this.prismaService.session.delete({
      where: {
        id: session.id,
      },
    });

    return {
      message: "Logout successful",
    };
  }

  async logoutAll(userId: string) {
    await this.prismaService.session.deleteMany({
      where: {
        userId,
      },
    });

    return {
      message: "Logged out from all devices successfully.",
    };
  }

  async forgotPassword(email: string) {
    const user = await this.userService.findByEmail(email);

    if (!user) {
      return {
        message:
          "If the email is registered, a verification code has been sent.",
      };
    }

    const otp = randomInt(100000, 1000000).toString();
    const challengeId = randomBytes(32).toString("hex");

    const otpHash = await argon2.hash(otp);

    await this.prismaService.passwordResetToken.deleteMany({
      where: {
        userId: user.id,
      },
    });

    await this.prismaService.passwordResetToken.create({
      data: {
        userId: user.id,
        challengeId,
        otpHash,
        expiredAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    await this.mailService.sendPasswordResetOtp(user.email, otp);

    if (process.env.NODE_ENV !== "production") {
      console.log(`[PASSWORD RESET] OTP: ${otp}`);
      console.log(`[PASSWORD RESET] Challenge ID: ${challengeId}`);
    }

    return {
      message: "If the email is registered, a verification code has been sent.",
      challengeId,
    };
  }

  async verifyResetOtp(challengeId: string, otp: string, response: Response) {
    const resetToken = await this.prismaService.passwordResetToken.findUnique({
      where: {
        challengeId,
      },
    });

    if (!resetToken) {
      throw new UnauthorizedException("Invalid verification request.");
    }

    if (resetToken.expiredAt < new Date()) {
      throw new UnauthorizedException("Verification code has expired.");
    }

    if (resetToken.verifiedAt) {
      throw new UnauthorizedException(
        "Verification code has already been used.",
      );
    }

    if (resetToken.attempts >= 5) {
      throw new UnauthorizedException("Too many verification attempts");
    }

    const isValid = await argon2.verify(resetToken.otpHash, otp);

    if (!isValid) {
      await this.prismaService.passwordResetToken.update({
        where: {
          id: resetToken.id,
        },
        data: {
          attempts: {
            increment: 1,
          },
        },
      });

      throw new UnauthorizedException("Invalid verification code.");
    }

    const rawResetToken = randomBytes(32).toString("hex");
    const resetTokenHash = await argon2.hash(rawResetToken);

    await this.prismaService.passwordResetToken.update({
      where: { id: resetToken.id },
      data: {
        verifiedAt: new Date(),
        resetTokenHash,
      },
    });

    const resetCookieValue = `${resetToken.id}.${rawResetToken}`;

    response.cookie("password_reset_token", resetCookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 10 * 60 * 1000,
    });

    return {
      message: "Verification successful",
    };
  }

  async resetPassword(
    password: string,
    confirmPassword: string,
    resetToken: string | undefined,
    response: Response,
  ) {
    if (!resetToken) {
      throw new UnauthorizedException("Password reset session is missing.");
    }

    if (password !== confirmPassword) {
      throw new UnauthorizedException("Passwords do not match.");
    }

    const [resetId, rawResetToken] = resetToken.split(".");

    if (!resetId || !rawResetToken) {
      throw new UnauthorizedException("Invalid password reset session.");
    }

    const passwordReset =
      await this.prismaService.passwordResetToken.findUnique({
        where: {
          id: resetId,
        },
      });

    if (!passwordReset) {
      throw new UnauthorizedException("Invalid password reset session.");
    }

    if (!passwordReset.verifiedAt) {
      throw new UnauthorizedException(
        "Password reset verification is required.",
      );
    }

    if (passwordReset.expiredAt < new Date()) {
      throw new UnauthorizedException("Password reset session has expired.");
    }

    if (!passwordReset.resetTokenHash) {
      throw new UnauthorizedException("Invalid password reset session.");
    }

    const isValid = await argon2.verify(
      passwordReset.resetTokenHash,
      rawResetToken,
    );

    if (passwordReset.expiredAt < new Date()) {
      throw new UnauthorizedException("Password reset session has expired.");
    }

    if (!passwordReset.resetTokenHash) {
      throw new UnauthorizedException("Invalid password reset session.");
    }

    const passwordHash = await argon2.hash(password);

    await this.prismaService.user.update({
      where: { id: passwordReset.userId },
      data: {
        password: passwordHash,
      },
    });

    await this.prismaService.session.deleteMany({
      where: { id: passwordReset.userId },
    });

    await this.prismaService.passwordResetToken.delete({
      where: { id: passwordReset.id },
    });

    response.clearCookie("password_reset_token");

    return {
      message: "Password has been reset successfully.",
    };
  }

  async resendResetOtp(challengeId: string) {
    const passwordReset =
      await this.prismaService.passwordResetToken.findUnique({
        where: { challengeId },
      });

    if (!passwordReset) {
      throw new UnauthorizedException("Invalid verification request.");
    }

    if (passwordReset.verifiedAt) {
      throw new UnauthorizedException(
        "Verification has already been completed.",
      );
    }

    if (passwordReset.expiredAt < new Date()) {
      throw new UnauthorizedException("Verification request has expired.");
    }

    const RESEND_COOLDOWN = 60 * 100;
    if (
      passwordReset.lastResentAt &&
      Date.now() - passwordReset.lastResentAt.getTime() < RESEND_COOLDOWN
    ) {
      throw new HttpException(
        "Please wait before requesting another code.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // ===========================

    const otp = randomInt(100000, 1000000).toString();

    const otpHash = await argon2.hash(otp);

    await this.prismaService.passwordResetToken.update({
      where: {
        id: passwordReset.id,
      },
      data: {
        otpHash,
        attempts: 0,
        lastResentAt: new Date(),
        expiredAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    const user = await this.userService.findById(passwordReset.userId);

    if (!user) {
      throw new UnauthorizedException("Invalid verification request.");
    }

    await this.mailService.sendPasswordResetOtp(user.email, otp);

    return {
      message: "A new verification code has been sent.",
    };
  }
}
