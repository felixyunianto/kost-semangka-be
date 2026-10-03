import { Body, Controller, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "./decorators/current-user.decorator";
import { TCurrentUser } from "./types/current-user.type";
import { UsersService } from "./users.service";
import { ChangePasswordDto } from "./dto/change-password.dto";

@Controller("users")
export class UsersController {
  constructor(private readonly userService: UsersService) {}

  @Patch("/change-password")
  @UseGuards(JwtAuthGuard)
  changePassword(
    @CurrentUser() user: TCurrentUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.userService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      dto.confirmPassword,
    );
  }
}
