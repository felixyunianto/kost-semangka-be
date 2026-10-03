import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import * as argon2 from "argon2";

import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}

  async findById(id: string) {
    return this.prismaService.user.findUnique({
      where: {
        id,
      },
    });
  }

  async findByEmail(email: string) {
    return this.prismaService.user.findUnique({
      where: {
        email,
      },
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) {
    if (newPassword !== confirmPassword) {
      throw new BadRequestException("New passwords do not match.");
    }

    if (currentPassword === newPassword) {
      throw new BadRequestException(
        "New password must be different from current password",
      );
    }

    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found.");
    }

    const isPasswordValid = await argon2.verify(user.password, currentPassword);

    if (!isPasswordValid) {
      throw new UnauthorizedException("Current password is incorrect.");
    }

    const newPasswordHash = await argon2.hash(newPassword);

    await this.prismaService.$transaction([
      this.prismaService.user.update({
        where: { id: userId },
        data: { password: newPasswordHash },
      }),

      this.prismaService.session.deleteMany({
        where: { userId },
      }),
    ]);

    return {
      message: "Password changed successfully.",
    };
  }
}
